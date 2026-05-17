const logger = require('../utils/logger');
const express = require('express');
const {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} = require('@simplewebauthn/server');

const User = require('../models/User');
const PasskeyCredential = require('../models/PasskeyCredential');
const TwoFactor = require('../models/TwoFactor');
const authenticateToken = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { logLogin } = require('../middleware/auditLog');
const {
  base64UrlToBuffer,
  bufferToBase64Url,
  consumeChallenge,
  getExpectedOrigins,
  getRpId,
  getRpName,
  storeChallenge,
  toCredentialDescriptor
} = require('../utils/webauthn');
const { attachPasskeyEnrollmentStatus } = require('../utils/passkeyEnrollment');
const { createTwoFactorLoginChallenge } = require('../utils/twoFactorSecurity');

const router = express.Router();
const requireCsrf = authenticateToken.requireCsrf;
const createSession = authenticateToken.createSession;
const setSessionCookies = authenticateToken.setSessionCookies;

const normalizeIdentifier = (value) => typeof value === 'string' ? value.trim() : '';
const normalizeEmail = (value) => normalizeIdentifier(value).toLowerCase();
const serializeUser = (user) => attachPasskeyEnrollmentStatus({
  id: user._id,
  username: user.username,
  email: user.email || null,
  emailVerified: Boolean(user.emailVerified),
  bio: user.bio,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  location: user.location,
  avatar: user.avatar,
  status: user.status,
  lastSeen: user.lastSeen,
  joinedAt: user.joinedAt
}, user._id);

const serializePasskey = (passkey, currentDeviceId = null) => ({
  id: passkey._id,
  label: passkey.label || 'Passkey',
  createdAt: passkey.createdAt,
  lastUsedAt: passkey.lastUsedAt,
  transports: passkey.transports || [],
  deviceType: passkey.deviceType,
  backedUp: Boolean(passkey.backedUp),
  aaguid: passkey.aaguid || null,
  deviceId: passkey.deviceId || null,
  isCurrentDevice: Boolean(currentDeviceId && passkey.deviceId === currentDeviceId)
});

const loadUserByIdentifier = async (identifier) => {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  if (!normalizedIdentifier) {
    return null;
  }

  return User.findOne({
    $or: [
      { username: normalizedIdentifier },
      { email: normalizeEmail(normalizedIdentifier) }
    ],
    isActive: true
  });
};

router.post('/register/options', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existingPasskeys = await PasskeyCredential.find({
      user: user._id,
      revokedAt: null
    }).select('credentialID transports');

    const options = await generateRegistrationOptions({
      rpName: getRpName(),
      rpID: getRpId(req),
      userID: Buffer.from(user._id.toString(), 'utf8'),
      userName: user.email || user.username,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username,
      excludeCredentials: existingPasskeys.map((passkey) => toCredentialDescriptor(passkey)),
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required'
      },
      attestationType: 'none',
      preferredAuthenticatorType: 'localDevice'
    });

    const attemptId = await storeChallenge('register', {
      challenge: options.challenge,
      userId: user._id.toString(),
      rpId: getRpId(req),
      expectedOrigins: getExpectedOrigins(req),
      deviceId: req.deviceId || null
    });

    res.json({
      attemptId,
      options
    });
  } catch (error) {
    logger.error('Passkey registration options error:', error);
    res.status(500).json({ message: 'Failed to prepare passkey registration.' });
  }
});

router.post('/register/verify', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const attemptId = normalizeIdentifier(req.body?.attemptId);
    const response = req.body?.response;
    const label = normalizeIdentifier(req.body?.label) || 'Passkey';

    if (!attemptId || !response) {
      return res.status(400).json({ message: 'Passkey registration payload is required.' });
    }

    const challengeState = await consumeChallenge('register', attemptId);
    if (!challengeState || challengeState.userId !== req.user._id.toString()) {
      return res.status(400).json({ message: 'Passkey registration challenge expired. Start again.' });
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeState.challenge,
      expectedOrigin: challengeState.expectedOrigins,
      expectedRPID: challengeState.rpId,
      requireUserVerification: true
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ message: 'Passkey registration could not be verified.' });
    }

    const { credential, credentialBackedUp, credentialDeviceType, aaguid, origin } = verification.registrationInfo;
    const credentialID = credential.id;

    const existingPasskey = await PasskeyCredential.findOne({ credentialID });
    if (existingPasskey && existingPasskey.user.toString() !== req.user._id.toString()) {
      return res.status(409).json({ message: 'That passkey is already linked to another account.' });
    }

    const upsertedPasskey = await PasskeyCredential.findOneAndUpdate(
      { credentialID },
      {
        user: req.user._id,
        credentialID,
        publicKey: bufferToBase64Url(credential.publicKey),
        counter: credential.counter,
        transports: Array.isArray(response.response?.transports) ? response.response.transports : [],
        deviceType: credentialDeviceType,
        backedUp: Boolean(credentialBackedUp),
        aaguid,
        webauthnUserID: req.user._id.toString(),
        label,
        deviceId: challengeState.deviceId || req.deviceId || null,
        origin,
        revokedAt: null
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(existingPasskey ? 200 : 201).json({
      message: 'Passkey registered successfully.',
      passkey: serializePasskey(upsertedPasskey, req.deviceId || null)
    });
  } catch (error) {
    logger.error('Passkey registration verification error:', error);
    res.status(500).json({ message: 'Failed to verify passkey registration.' });
  }
});

router.post('/authenticate/options', authLimiter, async (req, res) => {
  try {
    const identifier = normalizeIdentifier(req.body?.identifier);
    let expectedUserId = null;
    let allowCredentials;

    if (identifier) {
      const user = await loadUserByIdentifier(identifier);
      if (!user) {
        return res.status(400).json({ message: 'No passkeys are available for that account yet.' });
      }

      const passkeys = await PasskeyCredential.find({
        user: user._id,
        revokedAt: null
      }).select('credentialID transports');

      if (!passkeys.length) {
        return res.status(400).json({ message: 'No passkeys are available for that account yet.' });
      }

      expectedUserId = user._id.toString();
      allowCredentials = passkeys.map((passkey) => toCredentialDescriptor(passkey));
    }

    const options = await generateAuthenticationOptions({
      rpID: getRpId(req),
      allowCredentials,
      userVerification: 'required'
    });

    const attemptId = await storeChallenge('authenticate', {
      challenge: options.challenge,
      rpId: getRpId(req),
      expectedOrigins: getExpectedOrigins(req),
      expectedUserId
    });

    res.json({
      attemptId,
      options
    });
  } catch (error) {
    logger.error('Passkey authentication options error:', error);
    res.status(500).json({ message: 'Failed to prepare passkey sign-in.' });
  }
});

router.post('/authenticate/verify', authLimiter, async (req, res) => {
  try {
    const attemptId = normalizeIdentifier(req.body?.attemptId);
    const response = req.body?.response;

    if (!attemptId || !response?.id) {
      return res.status(400).json({ message: 'Passkey authentication payload is required.' });
    }

    const challengeState = await consumeChallenge('authenticate', attemptId);
    if (!challengeState) {
      return res.status(400).json({ message: 'Passkey sign-in challenge expired. Start again.' });
    }

    const passkey = await PasskeyCredential.findOne({
      credentialID: response.id,
      revokedAt: null
    });

    if (!passkey) {
      return res.status(401).json({ message: 'This passkey is not linked to an active account.' });
    }

    if (challengeState.expectedUserId && challengeState.expectedUserId !== passkey.user.toString()) {
      return res.status(401).json({ message: 'That passkey does not match the requested account.' });
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeState.challenge,
      expectedOrigin: challengeState.expectedOrigins,
      expectedRPID: challengeState.rpId,
      credential: {
        id: passkey.credentialID,
        publicKey: base64UrlToBuffer(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports
      },
      requireUserVerification: true
    });

    if (!verification.verified) {
      return res.status(401).json({ message: 'Passkey sign-in could not be verified.' });
    }

    passkey.counter = verification.authenticationInfo.newCounter;
    passkey.backedUp = Boolean(verification.authenticationInfo.credentialBackedUp);
    passkey.deviceType = verification.authenticationInfo.credentialDeviceType;
    passkey.lastUsedAt = new Date();
    passkey.origin = verification.authenticationInfo.origin || passkey.origin;
    await passkey.save();

    const user = await User.findById(passkey.user);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'That account is no longer available.' });
    }

    const twoFactor = await TwoFactor.findOne({ user: user._id, enabled: true }).select('_id');
    if (twoFactor) {
      return res.json({
        requires2FA: true,
        partialToken: createTwoFactorLoginChallenge(user._id, { method: 'passkey' }),
        message: 'Enter your authenticator code to continue.'
      });
    }

    user.lastSeen = new Date();
    user.status = 'online';
    await user.save({ validateBeforeSave: false });

    const { session, sessionToken, csrfToken } = await createSession({
      userId: user._id,
      req,
      deviceId: authenticateToken.getRequestDeviceId(req)
    });

    setSessionCookies(res, {
      sessionToken,
      csrfToken,
      expiresAt: session.expiresAt
    });

    await logLogin(user._id, req);

    res.json({
      message: 'Passkey sign-in successful',
      user: await serializeUser(user),
      session: {
        deviceId: session.deviceId,
        expiresAt: session.expiresAt
      }
    });
  } catch (error) {
    logger.error('Passkey authentication verification error:', error);
    res.status(500).json({ message: 'Failed to verify passkey sign-in.' });
  }
});

router.get('/credentials', authenticateToken, async (req, res) => {
  try {
    const passkeys = await PasskeyCredential.find({
      user: req.user._id,
      revokedAt: null
    }).sort({ lastUsedAt: -1, createdAt: -1 });

    res.json({
      passkeys: passkeys.map((passkey) => serializePasskey(passkey, req.deviceId || null))
    });
  } catch (error) {
    logger.error('Passkey list error:', error);
    res.status(500).json({ message: 'Failed to load passkeys.' });
  }
});

router.delete('/credentials/:credentialId', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const passkey = await PasskeyCredential.findOne({
      _id: req.params.credentialId,
      user: req.user._id,
      revokedAt: null
    });

    if (!passkey) {
      return res.status(404).json({ message: 'Passkey not found.' });
    }

    passkey.revokedAt = new Date();
    await passkey.save();

    res.json({
      message: 'Passkey revoked successfully.',
      passkey: serializePasskey(passkey, req.deviceId || null)
    });
  } catch (error) {
    logger.error('Passkey revoke error:', error);
    res.status(500).json({ message: 'Failed to revoke passkey.' });
  }
});

module.exports = router;
