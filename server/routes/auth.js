const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const TwoFactor = require('../models/TwoFactor');
const authenticateToken = require('../middleware/auth');
const cacheService = require('../services/cacheService');
const Session = require('../models/Session');
const Chat = require('../models/Chat');
const PrivateMessage = require('../models/PrivateMessage');
const Room = require('../models/Room');
const Message = require('../models/Message');
const Device = require('../models/Device');
const PasskeyCredential = require('../models/PasskeyCredential');
const BlockedUser = require('../models/BlockedUser');
const UserReport = require('../models/UserReport');
const logger = require('../utils/logger');
const {
  authLimiter,
  checkAccountLockout,
  clearFailedAttempts,
  recordFailedAttempt
} = require('../middleware/rateLimiter');
const {
  logLogin,
  logLogout,
  logPasswordChange
} = require('../middleware/auditLog');
const {
  isValidEmail,
  validatePassword,
  validateUsername,
  buildSafeSearchRegex
} = require('../utils/validation');
const { parsePaginationLimit } = require('../utils/pagination');
const {
  attachPasskeyEnrollmentStatus,
  requirePasskeyEnrollment
} = require('../utils/passkeyEnrollment');
const { createTwoFactorLoginChallenge } = require('../utils/twoFactorSecurity');
const {
  attachEmailVerificationChallenge,
  createEmailVerificationChallenge,
  getDevelopmentVerificationHint,
  hashEmailVerificationToken
} = require('../utils/emailVerification');
const {
  attachPasswordResetChallenge,
  createPasswordResetChallenge,
  getDevelopmentPasswordResetHint,
  hashPasswordResetToken
} = require('../utils/passwordReset');
const { getBlockedUserIdsFor } = require('../utils/userBlocks');

const router = express.Router();
const requireCsrf = authenticateToken.requireCsrf;
const createSession = authenticateToken.createSession;
const setSessionCookies = authenticateToken.setSessionCookies;
const clearSessionCookies = authenticateToken.clearSessionCookies;
const revokeSession = authenticateToken.revokeSession;
const normalizeIdentifier = (value) => typeof value === 'string' ? value.trim() : '';
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const normalizeOptionalEmail = (value) => {
  const normalizedValue = normalizeIdentifier(value).toLowerCase();
  return normalizedValue || null;
};
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

const createEmailVerificationResponse = (req, user, challenge) => {
  const verificationUrl = getDevelopmentVerificationHint(req, challenge.token);
  return {
    emailVerificationRequired: true,
    emailVerificationExpiresAt: challenge.expiresAt,
    ...(verificationUrl ? { verificationUrl } : {})
  };
};

const createPasswordResetResponse = (req, challenge) => {
  const resetUrl = getDevelopmentPasswordResetHint(req, challenge.token);
  return {
    passwordResetExpiresAt: challenge.expiresAt,
    ...(resetUrl ? { resetUrl } : {})
  };
};

const rotateSessionForProfileChange = async (req, res, user) => {
  if (req.session) {
    req.session.revokedAt = new Date();
    await req.session.save();
    await cacheService.session.delete(req.session.tokenHash);
  }

  const { session, sessionToken, csrfToken } = await createSession({
    userId: user._id,
    req,
    deviceId: req.deviceId || authenticateToken.getRequestDeviceId(req)
  });

  setSessionCookies(res, {
    sessionToken,
    csrfToken,
    expiresAt: session.expiresAt
  });

  return {
    deviceId: session.deviceId,
    expiresAt: session.expiresAt
  };
};

const serializeSession = (session, currentSessionId = null) => ({
  id: session._id,
  deviceId: session.deviceId || null,
  userAgent: session.userAgent || '',
  ipAddress: session.ipAddress || null,
  lastSeenAt: session.lastSeenAt,
  expiresAt: session.expiresAt,
  createdAt: session.createdAt,
  isCurrent: currentSessionId ? session._id.toString() === currentSessionId.toString() : false
});

// Register new user
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password, bio, firstName, lastName, phone, location, avatar } = req.body;
    const normalizedUsername = normalizeIdentifier(username);
    const normalizedEmail = normalizeOptionalEmail(email);

    // Validation
    if (!normalizedUsername || !normalizedEmail || !password) {
      return res.status(400).json({ 
        message: 'Username, email, and password are required' 
      });
    }

    const usernameValidation = validateUsername(normalizedUsername);
    if (!usernameValidation.isValid) {
      return res.status(400).json({
        message: usernameValidation.error
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        message: passwordValidation.error
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        message: 'Please enter a valid email'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { username: normalizedUsername },
        { email: normalizedEmail }
      ]
    });

    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        return res.status(409).json({ message: 'Email already registered' });
      }
      if (existingUser.username === normalizedUsername) {
        return res.status(409).json({ message: 'Username already taken' });
      }
    }

    const emailVerificationChallenge = createEmailVerificationChallenge();

    // Create new user
    const user = new User({
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      bio: bio || '',
      firstName: firstName || '',
      lastName: lastName || '',
      phone: phone || '',
      location: location || '',
      avatar: avatar || null
    });
    attachEmailVerificationChallenge(user, emailVerificationChallenge);

    await user.save();

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

    res.status(201).json({
      message: 'User registered successfully',
      user: await serializeAuthUser(user),
      emailVerification: createEmailVerificationResponse(req, user, emailVerificationChallenge),
      session: {
        deviceId: session.deviceId,
        expiresAt: session.expiresAt
      }
    });
  } catch (error) {
    logger.error('Registration error', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({ 
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists` 
      });
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: errors.join(', ') });
    }
    
    res.status(500).json({ message: 'Server error during registration' });
  }
});

router.get('/email-verification/verify', authLimiter, async (req, res) => {
  try {
    const token = normalizeIdentifier(req.query?.token);
    if (!token) {
      return res.status(400).json({ message: 'Verification token is required.' });
    }

    const user = await User.findOne({
      emailVerificationTokenHash: hashEmailVerificationToken(token),
      emailVerificationExpiresAt: { $gt: new Date() },
      isActive: true
    }).select('+emailVerificationTokenHash +emailVerificationExpiresAt');

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token.' });
    }

    user.emailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpiresAt = null;
    await user.save({ validateBeforeSave: false });
    await cacheService.memory.delete(`user-profile:${user._id.toString()}`);

    res.json({
      message: 'Email verified successfully.',
      user: await serializeAuthUser(user)
    });
  } catch (error) {
    logger.error('Email verification error', error);
    res.status(500).json({ message: 'Server error verifying email.' });
  }
});

router.post('/email-verification/resend', authenticateToken, requireCsrf, authLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('+emailVerificationTokenHash +emailVerificationExpiresAt');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.email) {
      return res.status(400).json({ message: 'Add an email address before verifying it.' });
    }

    if (user.emailVerified) {
      return res.json({ message: 'Email is already verified.', user: await serializeAuthUser(user) });
    }

    const challenge = createEmailVerificationChallenge();
    attachEmailVerificationChallenge(user, challenge);
    await user.save({ validateBeforeSave: false });
    await cacheService.memory.delete(`user-profile:${user._id.toString()}`);

    res.json({
      message: 'Verification email prepared.',
      emailVerification: createEmailVerificationResponse(req, user, challenge),
      user: await serializeAuthUser(user)
    });
  } catch (error) {
    logger.error('Email verification resend error', error);
    res.status(500).json({ message: 'Server error preparing email verification.' });
  }
});

router.post('/password/forgot', authLimiter, async (req, res) => {
  try {
    const identifier = normalizeIdentifier(req.body?.identifier || req.body?.email || req.body?.username || '');
    if (!identifier) {
      return res.status(400).json({ message: 'Email or username is required.' });
    }

    const normalizedEmail = normalizeOptionalEmail(identifier);
    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: normalizedEmail || identifier.toLowerCase() }
      ],
      isActive: true
    }).select('+passwordResetTokenHash +passwordResetExpiresAt');

    if (!user) {
      return res.json({ message: 'If that account exists, a reset link has been prepared.' });
    }

    const challenge = createPasswordResetChallenge();
    attachPasswordResetChallenge(user, challenge);
    await user.save({ validateBeforeSave: false });

    res.json({
      message: 'If that account exists, a reset link has been prepared.',
      passwordReset: createPasswordResetResponse(req, challenge)
    });
  } catch (error) {
    logger.error('Password reset request error', error);
    res.status(500).json({ message: 'Server error preparing password reset.' });
  }
});

router.post('/password/reset', authLimiter, async (req, res) => {
  try {
    const token = normalizeIdentifier(req.body?.token);
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Reset token and new password are required.' });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ message: passwordValidation.error });
    }

    const user = await User.findOne({
      passwordResetTokenHash: hashPasswordResetToken(token),
      passwordResetExpiresAt: { $gt: new Date() },
      isActive: true
    }).select('+passwordResetTokenHash +passwordResetExpiresAt');

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired password reset token.' });
    }

    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    const sessionsToRevoke = await Session.find({ user: user._id, revokedAt: null }).select('tokenHash');
    await Session.updateMany(
      { user: user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    await Promise.all(sessionsToRevoke.map((session) => cacheService.session.delete(session.tokenHash)));

    res.json({ message: 'Password reset successfully. Sign in with the new password.' });
  } catch (error) {
    logger.error('Password reset error', error);
    res.status(500).json({ message: 'Server error resetting password.' });
  }
});

// Login user
router.post('/login', authLimiter, async (req, res) => {
  try {
    const rawIdentifier = req.body?.identifier ?? req.body?.username ?? '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const identifier = normalizeIdentifier(rawIdentifier);
    const normalizedEmail = normalizeOptionalEmail(identifier);

    if (!identifier || !password) {
      return res.status(400).json({ 
        message: 'Username or email and password are required' 
      });
    }

    const lockout = await checkAccountLockout(identifier);
    if (lockout?.locked) {
      return res.status(429).json({
        message: 'Account temporarily locked. Try again later.',
        retryAfter: lockout.retryAfterSeconds
      });
    }

    // Find user by email or username
    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: normalizedEmail || identifier.toLowerCase() }
      ],
      isActive: true
    });

    if (!user) {
      await recordFailedAttempt(identifier);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    
    if (!isValidPassword) {
      await recordFailedAttempt(identifier);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    await clearFailedAttempts(identifier);

    const twoFactor = await TwoFactor.findOne({ user: user._id, enabled: true }).select('_id');
    if (twoFactor) {
      return res.json({
        requires2FA: true,
        partialToken: createTwoFactorLoginChallenge(user._id, { method: 'password' }),
        message: 'Enter your authenticator code to continue.'
      });
    }

    // Update last seen and status
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
      user: await serializeAuthUser(user),
      session: {
        deviceId: session.deviceId,
        expiresAt: session.expiresAt
      }
    });
  } catch (error) {
    logger.error('Login error', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Logout user (update status)
router.post('/logout', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.status = 'offline';
      user.lastSeen = new Date();
      await user.save({ validateBeforeSave: false });
    }

    await revokeSession(req.session);
    clearSessionCookies(res);
    await logLogout(req.user._id, req);

    res.json({ message: 'Logout successful' });
  } catch (error) {
    logger.error('Logout error', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        ...(await serializeAuthUser(user))
      }
    });
  } catch (error) {
    logger.error('Profile fetch error', error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
});

// Update user profile (PATCH for partial updates)
router.patch('/profile', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const { username, email, bio, firstName, lastName, phone, location, avatar } = req.body;
    const user = await User.findById(req.user._id);
    let identityChanged = false;
    let emailVerificationChallenge = null;

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update username if provided and different
    if (username && username !== user.username) {
      const normalizedUsername = normalizeIdentifier(username);
      const usernameValidation = validateUsername(normalizedUsername);

      if (!usernameValidation.isValid) {
        return res.status(400).json({
          message: usernameValidation.error
        });
      }

      const existingUser = await User.findOne({ 
        username: normalizedUsername, 
        _id: { $ne: user._id } 
      });
      
      if (existingUser) {
        return res.status(409).json({ message: 'Username already taken' });
      }
      
      user.username = normalizedUsername;
      identityChanged = true;
    }

    // Update or clear email if provided
    if (email !== undefined) {
      const normalizedEmail = normalizeOptionalEmail(email);
      const currentEmail = user.email || null;

      if (!normalizedEmail) {
        return res.status(400).json({ message: 'Email is required' });
      }

      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ message: 'Please enter a valid email' });
      }

      if (normalizedEmail !== currentEmail) {
        const existingUser = await User.findOne({ 
          email: normalizedEmail, 
          _id: { $ne: user._id } 
        });
        
        if (existingUser) {
          return res.status(409).json({ message: 'Email already in use' });
        }

        user.email = normalizedEmail;
        emailVerificationChallenge = createEmailVerificationChallenge();
        attachEmailVerificationChallenge(user, emailVerificationChallenge);
        identityChanged = true;
      }
    }

    // Update other fields
    if (bio !== undefined) {
      if (bio.length > 200) {
        return res.status(400).json({ 
          message: 'Bio must be less than 200 characters' 
        });
      }
      user.bio = bio;
    }

    if (firstName !== undefined) user.firstName = firstName.trim();
    if (lastName !== undefined) user.lastName = lastName.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (location !== undefined) user.location = location.trim();
    if (avatar !== undefined) user.avatar = avatar || null;

    await user.save();
    await cacheService.memory.delete(`user-profile:${user._id.toString()}`);
    const rotatedSession = identityChanged
      ? await rotateSessionForProfileChange(req, res, user)
      : null;

    res.json({
      message: 'Profile updated successfully',
      user: await serializeAuthUser(user),
      ...(rotatedSession ? { session: rotatedSession } : {}),
      ...(emailVerificationChallenge
        ? { emailVerification: createEmailVerificationResponse(req, user, emailVerificationChallenge) }
        : {})
    });
  } catch (error) {
    logger.error('Profile update error', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({ 
        message: `${field.charAt(0).toUpperCase() + field.slice(1)} already in use` 
      });
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: errors.join(', ') });
    }
    
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// Update user status
router.patch('/status', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['online', 'away', 'busy', 'offline'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        message: 'Invalid status. Must be one of: online, away, busy, offline' 
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.status = status;
    await user.save();
    await cacheService.memory.delete(`user-profile:${user._id.toString()}`);

    res.json({
      message: 'Status updated successfully',
      status: user.status
    });
  } catch (error) {
    logger.error('Status update error', error);
    res.status(500).json({ message: 'Server error updating status' });
  }
});

// Update user profile (PUT - original endpoint)
router.put('/profile', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const { username, bio, status, avatar } = req.body;
    const user = await User.findById(req.user._id);
    let identityChanged = false;

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update fields if provided
    if (username && username !== user.username) {
      // Check if username is already taken
      const existingUser = await User.findOne({ 
        username, 
        _id: { $ne: user._id } 
      });
      
      if (existingUser) {
        return res.status(409).json({ message: 'Username already taken' });
      }
      
      if (username.length < 3 || username.length > 30) {
        return res.status(400).json({ 
          message: 'Username must be between 3 and 30 characters' 
        });
      }
      
      user.username = username.trim();
      identityChanged = true;
    }

    if (bio !== undefined) {
      if (bio.length > 200) {
        return res.status(400).json({ 
          message: 'Bio must be less than 200 characters' 
        });
      }
      user.bio = bio;
    }

    if (status && ['online', 'offline', 'away', 'busy'].includes(status)) {
      user.status = status;
    }

    if (avatar !== undefined) {
      user.avatar = avatar || null;
    }

    await user.save();
    await cacheService.memory.delete(`user-profile:${user._id.toString()}`);
    const rotatedSession = identityChanged
      ? await rotateSessionForProfileChange(req, res, user)
      : null;

    res.json({
      message: 'Profile updated successfully',
      user: await serializeAuthUser(user),
      ...(rotatedSession ? { session: rotatedSession } : {})
    });
  } catch (error) {
    logger.error('Profile update error', error);
    
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Username already taken' });
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ message: errors.join(', ') });
    }
    
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// Change password
router.put('/change-password', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: 'Current password and new password are required' 
      });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        message: passwordValidation.error
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    const sessionsToRevoke = await Session.find(
      {
        user: req.user._id,
        _id: { $ne: req.session?._id },
        revokedAt: null
      }
    ).select('tokenHash');

    await Session.updateMany(
      {
        user: req.user._id,
        _id: { $ne: req.session?._id },
        revokedAt: null
      },
      {
        $set: {
          revokedAt: new Date()
        }
      }
    );

    await Promise.all(
      sessionsToRevoke.map((session) => cacheService.session.delete(session.tokenHash))
    );

    await logPasswordChange(req.user._id, req);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Password change error', error);
    res.status(500).json({ message: 'Server error changing password' });
  }
});

router.get('/sessions', authenticateToken, requirePasskeyEnrollment, async (req, res) => {
  try {
    const sessions = await Session.find({
      user: req.user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    }).sort({ lastSeenAt: -1, createdAt: -1 });

    res.json({
      sessions: sessions.map((session) => serializeSession(session, req.session?._id))
    });
  } catch (error) {
    logger.error('Session list error', error);
    res.status(500).json({ message: 'Server error fetching sessions.' });
  }
});

router.delete('/sessions/:sessionId', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const session = await Session.findOne({
      _id: req.params.sessionId,
      user: req.user._id,
      revokedAt: null
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found.' });
    }

    await revokeSession(session);

    if (req.session?._id?.toString() === session._id.toString()) {
      clearSessionCookies(res);
    }

    res.json({ message: 'Session revoked.' });
  } catch (error) {
    logger.error('Session revoke error', error);
    res.status(500).json({ message: 'Server error revoking session.' });
  }
});

router.get('/export', authenticateToken, requirePasskeyEnrollment, async (req, res) => {
  try {
    const userId = req.user._id;
    const [directChatIds, roomIds] = await Promise.all([
      Chat.find({ participants: userId }).distinct('_id'),
      Room.find({ 'members.user': userId }).distinct('_id')
    ]);

    const [profile, devices, passkeys, sessions, directChats, directMessages, rooms, roomMessages, blockedUsers, submittedReports] = await Promise.all([
      User.findById(userId).select('-password').lean(),
      Device.find({ user: userId }).lean(),
      PasskeyCredential.find({ user: userId }).select('-publicKey -credentialID').lean(),
      Session.find({ user: userId }).select('-tokenHash -csrfTokenHash').lean(),
      Chat.find({ participants: userId }).populate('participants', 'username email avatar').lean(),
      PrivateMessage.find({
        $or: [
          { sender: userId },
          { chatId: { $in: directChatIds } }
        ]
      }).lean(),
      Room.find({ 'members.user': userId }).lean(),
      Message.find({
        room: { $in: roomIds }
      }).lean(),
      BlockedUser.find({ blocker: userId }).populate('blocked', 'username avatar').lean(),
      UserReport.find({ reporter: userId }).select('-reported').lean()
    ]);

    res.json({
      exportedAt: new Date().toISOString(),
      profile,
      devices,
      passkeys,
      sessions,
      directChats,
      directMessages,
      rooms,
      roomMessages,
      blockedUsers,
      submittedReports
    });
  } catch (error) {
    logger.error('Account export error', error);
    res.status(500).json({ message: 'Server error exporting account data.' });
  }
});

router.delete('/account', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
      return res.status(400).json({ message: 'Password is required to delete your account.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const passwordValid = await user.comparePassword(password);
    if (!passwordValid) {
      return res.status(401).json({ message: 'Password is incorrect.' });
    }

    await user.deleteOne();
    clearSessionCookies(res);

    res.json({ message: 'Account deleted successfully.' });
  } catch (error) {
    logger.error('Account deletion error', error);
    res.status(500).json({ message: 'Server error deleting account.' });
  }
});

router.get('/blocks', authenticateToken, requirePasskeyEnrollment, async (req, res) => {
  try {
    const blocks = await BlockedUser.find({ blocker: req.user._id })
      .populate('blocked', 'username avatar status lastSeen')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      blocks: blocks.map((block) => ({
        id: block._id,
        blockedUser: block.blocked,
        reason: block.reason || '',
        createdAt: block.createdAt
      }))
    });
  } catch (error) {
    logger.error('Block list error', error);
    res.status(500).json({ message: 'Server error fetching blocked users.' });
  }
});

router.post('/users/:userId/block', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const blockedUserId = normalizeIdentifier(req.params.userId);
    if (!isValidObjectId(blockedUserId) || blockedUserId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot block this user.' });
    }

    const targetUser = await User.findById(blockedUserId).select('_id username avatar');
    if (!targetUser || !targetUser.isActive) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const block = await BlockedUser.findOneAndUpdate(
      { blocker: req.user._id, blocked: targetUser._id },
      { reason: String(req.body?.reason || '').trim().slice(0, 500) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: 'User blocked.',
      block: {
        id: block._id,
        blockedUser: targetUser,
        reason: block.reason || '',
        createdAt: block.createdAt
      }
    });
  } catch (error) {
    logger.error('User block error', error);
    res.status(500).json({ message: 'Server error blocking user.' });
  }
});

router.delete('/users/:userId/block', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const blockedUserId = normalizeIdentifier(req.params.userId);
    if (!isValidObjectId(blockedUserId) || blockedUserId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot unblock this user.' });
    }

    await BlockedUser.deleteOne({
      blocker: req.user._id,
      blocked: blockedUserId
    });

    res.json({ message: 'User unblocked.' });
  } catch (error) {
    logger.error('User unblock error', error);
    res.status(500).json({ message: 'Server error unblocking user.' });
  }
});

router.post('/users/:userId/report', authenticateToken, requireCsrf, requirePasskeyEnrollment, async (req, res) => {
  try {
    const reportedUserId = normalizeIdentifier(req.params.userId);
    if (!isValidObjectId(reportedUserId) || reportedUserId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot report this user.' });
    }

    const targetUser = await User.findById(reportedUserId).select('_id');
    if (!targetUser || !targetUser.isActive) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const report = await UserReport.create({
      reporter: req.user._id,
      reported: targetUser._id,
      reason: String(req.body?.reason || 'abuse').trim().slice(0, 80) || 'abuse',
      details: String(req.body?.details || '').trim().slice(0, 1000)
    });

    res.status(201).json({
      message: 'Report submitted for review.',
      report: {
        id: report._id,
        status: report.status,
        createdAt: report.createdAt
      }
    });
  } catch (error) {
    logger.error('User report error', error);
    res.status(500).json({ message: 'Server error submitting report.' });
  }
});

// Verify JWT token
router.get('/verify', authenticateToken, async (req, res) => {
  res.json({ 
    valid: true, 
    user: await serializeAuthUser(req.user),
    session: {
      deviceId: req.deviceId || null,
      expiresAt: req.session?.expiresAt || null
    }
  });
});

// Search users (for adding to rooms or private chats)
router.get('/users/search', authenticateToken, requirePasskeyEnrollment, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ 
        message: 'Search query must be at least 2 characters' 
      });
    }

    const searchRegex = buildSafeSearchRegex(q);
    if (!searchRegex) {
      return res.status(400).json({ message: 'Search query must be valid text' });
    }
    const blockedUserIds = await getBlockedUserIdsFor(req.user._id);
    const users = await User.find({
      $and: [
        { _id: { $ne: req.user._id } }, // Exclude current user
        ...(blockedUserIds.length ? [{ _id: { $nin: blockedUserIds } }] : []),
        { isActive: true },
        { username: searchRegex }
      ]
    })
    .select('username avatar status lastSeen')
    .limit(parsePaginationLimit(limit, 10, 50))
    .sort({ username: 1 });

    res.json({ users });
  } catch (error) {
    logger.error('User search error', error);
    res.status(500).json({ message: 'Server error searching users' });
  }
});

module.exports = router;
