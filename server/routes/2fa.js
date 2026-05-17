const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const User = require('../models/User');
const TwoFactor = require('../models/TwoFactor');
const authenticateToken = require('../middleware/auth');
const logger = require('../utils/logger');
const { authLimiter } = require('../middleware/rateLimiter');
const { log2FAEnable, log2FADisable, logLogin } = require('../middleware/auditLog');
const { attachPasskeyEnrollmentStatus, requirePasskeyEnrollment } = require('../utils/passkeyEnrollment');
const {
  decryptTotpSecret,
  encryptTotpSecret,
  verifyTwoFactorLoginChallenge
} = require('../utils/twoFactorSecurity');
const requireCsrf = authenticateToken.requireCsrf;
const createSession = authenticateToken.createSession;
const setSessionCookies = authenticateToken.setSessionCookies;

const sanitizeToken = (token) => typeof token === 'string' ? token.trim() : '';
const generateBackupCodes = (count = 8) => Array.from(
  { length: count },
  () => crypto.randomBytes(10).toString('hex').toUpperCase().match(/.{1,4}/g).join('-')
);
const sanitizeBackupCodes = (backupCodes) => Array.isArray(backupCodes)
  ? backupCodes
    .map((code) => String(code || '').trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 10)
  : [];

const serializeAuthUser = async (user) => attachPasskeyEnrollmentStatus({
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

const getTotpSecret = (twoFactor) => decryptTotpSecret(twoFactor?.secret || '');

const verifyTotpCode = (twoFactor, token) => {
  const secret = getTotpSecret(twoFactor);
  if (!secret || !token) {
    return false;
  }

  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1
  });
};

const verifyAndConsumeBackupCode = async (twoFactor, token) => {
  if (!twoFactor || !token || !Array.isArray(twoFactor.backupCodes)) {
    return false;
  }

  for (let index = 0; index < twoFactor.backupCodes.length; index += 1) {
    const hashedCode = twoFactor.backupCodes[index];
    // eslint-disable-next-line no-await-in-loop
    const matched = await bcrypt.compare(token.toUpperCase(), hashedCode);
    if (matched) {
      twoFactor.backupCodes.splice(index, 1);
      await twoFactor.save();
      return true;
    }
  }

  return false;
};

const verifySecondFactor = async (twoFactor, token, { allowBackupCode = false } = {}) => {
  if (verifyTotpCode(twoFactor, token)) {
    return { verified: true, method: 'totp' };
  }

  if (allowBackupCode && await verifyAndConsumeBackupCode(twoFactor, token)) {
    return { verified: true, method: 'backup_code' };
  }

  return { verified: false, method: null };
};

router.post('/setup', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const userId = req.user._id;

    const existing = await TwoFactor.findOne({ user: userId });
    if (existing?.enabled) {
      return res.status(400).json({ message: '2FA is already enabled' });
    }

    const user = await User.findById(userId);
    const secret = speakeasy.generateSecret({
      name: `VaaniArc (@${user?.username || userId})`,
      length: 20
    });

    await TwoFactor.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        secret: encryptTotpSecret(secret.base32),
        enabled: false,
        backupCodes: []
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      qrCode: qrCodeUrl,
      otpauth: secret.otpauth_url
    });
  } catch (error) {
    logger.error('2FA setup error', error);
    res.status(500).json({ message: 'Failed to set up 2FA' });
  }
});

router.post('/enable', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const token = sanitizeToken(req.body?.token);
    const backupCodes = sanitizeBackupCodes(req.body?.backupCodes);
    const userId = req.user._id;

    const existing = await TwoFactor.findOne({ user: userId });
    if (existing?.enabled) {
      return res.status(400).json({ message: '2FA is already enabled' });
    }

    if (!token) {
      return res.status(400).json({ message: 'Verification code is required' });
    }

    if (!existing?.secret) {
      return res.status(400).json({ message: 'Start 2FA setup again before enabling it.' });
    }

    const secret = getTotpSecret(existing);

    const finalVerified = verifyTotpCode(existing, token);

    if (!finalVerified) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    const resolvedBackupCodes = backupCodes.length > 0 ? backupCodes : generateBackupCodes();
    const hashedCodes = await Promise.all(
      resolvedBackupCodes.map((code) => bcrypt.hash(code, 12))
    );

    await TwoFactor.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        secret: encryptTotpSecret(secret),
        enabled: true,
        backupCodes: hashedCodes
      },
      { upsert: true, new: true }
    );

    await log2FAEnable(userId, req);

    res.json({
      message: '2FA enabled successfully',
      backupCodes: resolvedBackupCodes
    });
  } catch (error) {
    logger.error('2FA enable error', error);
    res.status(500).json({ message: 'Failed to enable 2FA' });
  }
});

router.post('/verify', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const token = sanitizeToken(req.body?.token);
    const userId = req.user._id;

    const twoFactor = await TwoFactor.findOne({ user: userId, enabled: true });

    if (!twoFactor) {
      return res.status(400).json({ message: '2FA is not enabled' });
    }

    if (!token) {
      return res.status(400).json({ message: 'Verification code is required' });
    }

    const verified = verifyTotpCode(twoFactor, token);

    if (verified) {
      res.json({ verified: true, method: 'totp' });
    } else {
      res.status(401).json({ verified: false, message: 'Invalid code' });
    }
  } catch (error) {
    logger.error('2FA verify error', error);
    res.status(500).json({ message: 'Failed to verify 2FA' });
  }
});

router.post('/disable', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const token = sanitizeToken(req.body?.token);
    const userId = req.user._id;

    if (!password || !token) {
      return res.status(400).json({ message: 'Password and verification code are required' });
    }

    const user = await User.findById(userId);
    const isValid = await user.comparePassword(password);

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    const twoFactor = await TwoFactor.findOne({ user: userId, enabled: true });
    if (!twoFactor) {
      return res.status(400).json({ message: '2FA is not enabled' });
    }

    const verified = verifyTotpCode(twoFactor, token);

    if (!verified) {
      return res.status(401).json({ message: 'Invalid verification code' });
    }

    await TwoFactor.findOneAndUpdate({ user: userId }, { enabled: false });

    await log2FADisable(userId, req);

    res.json({ message: '2FA disabled successfully' });
  } catch (error) {
    logger.error('2FA disable error', error);
    res.status(500).json({ message: 'Failed to disable 2FA' });
  }
});

router.post('/verify-login', authLimiter, async (req, res) => {
  try {
    const partialToken = typeof req.body?.partialToken === 'string' ? req.body.partialToken : '';
    const token = sanitizeToken(req.body?.token);

    if (!partialToken || !token) {
      return res.status(400).json({ message: '2FA session and verification code are required.' });
    }

    const decoded = verifyTwoFactorLoginChallenge(partialToken);
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const twoFactor = await TwoFactor.findOne({ user: user._id, enabled: true });
    if (!twoFactor) {
      return res.status(400).json({ message: '2FA is not enabled for this account.' });
    }

    const verification = await verifySecondFactor(twoFactor, token, { allowBackupCode: true });
    if (!verification.verified) {
      return res.status(401).json({ message: 'Invalid verification code.' });
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
      message: 'Login successful',
      method: verification.method,
      user: await serializeAuthUser(user),
      session: {
        deviceId: session.deviceId,
        expiresAt: session.expiresAt
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: '2FA session expired. Start login again.' });
    }

    logger.error('2FA login verify error', error);
    res.status(500).json({ message: 'Failed to verify 2FA.' });
  }
});

router.get('/status', authenticateToken, requirePasskeyEnrollment, async (req, res) => {
  try {
    const userId = req.user._id;
    const twoFactor = await TwoFactor.findOne({ user: userId });

    res.json({
      enabled: twoFactor?.enabled || false,
      hasBackupCodes: twoFactor?.backupCodes?.length > 0,
      pendingSetup: Boolean(twoFactor?.secret && !twoFactor?.enabled)
    });
  } catch (error) {
    logger.error('2FA status error', error);
    res.status(500).json({ message: 'Failed to get 2FA status' });
  }
});

module.exports = router;
