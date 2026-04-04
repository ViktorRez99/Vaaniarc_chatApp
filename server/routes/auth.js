const express = require('express');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');
const cacheService = require('../services/cacheService');
const Session = require('../models/Session');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  logLogin,
  logLogout,
  logPasswordChange
} = require('../middleware/auditLog');
const {
  isValidEmail,
  validatePassword
} = require('../utils/validation');
const { parsePaginationLimit } = require('../utils/pagination');

const router = express.Router();
const requireCsrf = authenticateToken.requireCsrf;
const createSession = authenticateToken.createSession;
const setSessionCookies = authenticateToken.setSessionCookies;
const clearSessionCookies = authenticateToken.clearSessionCookies;
const revokeSession = authenticateToken.revokeSession;
const normalizeIdentifier = (value) => typeof value === 'string' ? value.trim() : '';
const normalizeOptionalEmail = (value) => {
  const normalizedValue = normalizeIdentifier(value).toLowerCase();
  return normalizedValue || null;
};

// Register new user
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password, bio, firstName, lastName, phone, location, avatar } = req.body;
    const normalizedUsername = normalizeIdentifier(username);
    const normalizedEmail = normalizeOptionalEmail(email);

    // Validation
    if (!normalizedUsername || !password) {
      return res.status(400).json({ 
        message: 'Username and password are required' 
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        message: passwordValidation.error
      });
    }

    if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
      return res.status(400).json({ 
        message: 'Username must be between 3 and 30 characters' 
      });
    }

    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        message: 'Please enter a valid email'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { username: normalizedUsername },
        ...(normalizedEmail ? [{ email: normalizedEmail }] : [])
      ]
    });

    if (existingUser) {
      if (normalizedEmail && existingUser.email === normalizedEmail) {
        return res.status(409).json({ message: 'Email already registered' });
      }
      if (existingUser.username === normalizedUsername) {
        return res.status(409).json({ message: 'Username already taken' });
      }
    }

    // Create new user
    const user = new User({
      username: normalizedUsername,
      email: normalizedEmail || undefined,
      password,
      bio: bio || '',
      firstName: firstName || '',
      lastName: lastName || '',
      phone: phone || '',
      location: location || '',
      avatar: avatar || null
    });

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
      user: {
        id: user._id,
        username: user.username,
        email: user.email || null,
        bio: user.bio,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        location: user.location,
        avatar: user.avatar,
        joinedAt: user.joinedAt
      },
      session: {
        deviceId: session.deviceId,
        expiresAt: session.expiresAt
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
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

    // Find user by email or username
    const user = await User.findOne({
      $or: [
        { username: identifier },
        { email: normalizedEmail || identifier.toLowerCase() }
      ],
      isActive: true
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
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
      user: {
        id: user._id,
        username: user.username,
        email: user.email || null,
        bio: user.bio,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        location: user.location,
        avatar: user.avatar,
        status: user.status,
        lastSeen: user.lastSeen,
        joinedAt: user.joinedAt
      },
      session: {
        deviceId: session.deviceId,
        expiresAt: session.expiresAt
      }
    });
  } catch (error) {
    console.error('Login error:', error);
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
    console.error('Logout error:', error);
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
        id: user._id,
        username: user.username,
        email: user.email || null,
        bio: user.bio,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        location: user.location,
        avatar: user.avatar,
        status: user.status,
        lastSeen: user.lastSeen,
        joinedAt: user.joinedAt
      }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
});

// Update user profile (PATCH for partial updates)
router.patch('/profile', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const { username, email, bio, firstName, lastName, phone, location, avatar } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update username if provided and different
    if (username && username !== user.username) {
      const normalizedUsername = normalizeIdentifier(username);

      if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
        return res.status(400).json({ 
          message: 'Username must be between 3 and 30 characters' 
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
    }

    // Update or clear email if provided
    if (email !== undefined) {
      const normalizedEmail = normalizeOptionalEmail(email);
      const currentEmail = user.email || null;

      if (normalizedEmail && !isValidEmail(normalizedEmail)) {
        return res.status(400).json({ message: 'Please enter a valid email' });
      }

      if (normalizedEmail !== currentEmail) {
        if (normalizedEmail) {
          const existingUser = await User.findOne({ 
            email: normalizedEmail, 
            _id: { $ne: user._id } 
          });
          
          if (existingUser) {
            return res.status(409).json({ message: 'Email already in use' });
          }
        }
        
        user.email = normalizedEmail || undefined;
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

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email || null,
        bio: user.bio,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        location: user.location,
        avatar: user.avatar,
        status: user.status,
        lastSeen: user.lastSeen,
        joinedAt: user.joinedAt
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    
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
router.patch('/status', authenticateToken, requireCsrf, async (req, res) => {
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
    console.error('Status update error:', error);
    res.status(500).json({ message: 'Server error updating status' });
  }
});

// Update user profile (PUT - original endpoint)
router.put('/profile', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const { username, bio, status, avatar } = req.body;
    const user = await User.findById(req.user._id);

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

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email || null,
        bio: user.bio,
        avatar: user.avatar,
        status: user.status,
        lastSeen: user.lastSeen,
        joinedAt: user.joinedAt
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    
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
router.put('/change-password', authenticateToken, requireCsrf, async (req, res) => {
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
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Server error changing password' });
  }
});

// Verify JWT token
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ 
    valid: true, 
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email || null
    },
    session: {
      deviceId: req.deviceId || null,
      expiresAt: req.session?.expiresAt || null
    }
  });
});

// Search users (for adding to rooms or private chats)
router.get('/users/search', authenticateToken, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ 
        message: 'Search query must be at least 2 characters' 
      });
    }

    const searchRegex = new RegExp(q.trim(), 'i');
    const users = await User.find({
      $and: [
        { _id: { $ne: req.user._id } }, // Exclude current user
        { isActive: true },
        { username: searchRegex }
      ]
    })
    .select('username avatar status lastSeen')
    .limit(parsePaginationLimit(limit, 10, 50))
    .sort({ username: 1 });

    res.json({ users });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({ message: 'Server error searching users' });
  }
});

module.exports = router;
