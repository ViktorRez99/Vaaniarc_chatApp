const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const User = require('../models/User');
const TwoFactor = require('../models/TwoFactor');
const authenticateToken = require('../middleware/auth');
const { log2FAEnable, log2FADisable } = require('../middleware/auditLog');
const requireCsrf = authenticateToken.requireCsrf;

const sanitizeToken = (token) => typeof token === 'string' ? token.trim() : '';
const generateBackupCodes = (count = 8) => Array.from(
  { length: count },
  () => crypto.randomBytes(4).toString('hex').toUpperCase()
);
const sanitizeBackupCodes = (backupCodes) => Array.isArray(backupCodes)
  ? backupCodes
    .map((code) => String(code || '').trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 10)
  : [];

router.post('/setup', authenticateToken, requireCsrf, async (req, res) => {
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
        secret: secret.base32,
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
    console.error('2FA setup error:', error);
    res.status(500).json({ message: 'Failed to set up 2FA' });
  }
});

router.post('/enable', authenticateToken, requireCsrf, async (req, res) => {
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

    const secret = existing.secret;

    const finalVerified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (!finalVerified) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    const resolvedBackupCodes = backupCodes.length > 0 ? backupCodes : generateBackupCodes();
    const hashedCodes = await Promise.all(
      resolvedBackupCodes.map((code) => bcrypt.hash(code, 10))
    );

    await TwoFactor.findOneAndUpdate(
      { user: userId },
      {
        user: userId,
        secret,
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
    console.error('2FA enable error:', error);
    res.status(500).json({ message: 'Failed to enable 2FA' });
  }
});

router.post('/verify', authenticateToken, requireCsrf, async (req, res) => {
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

    const verified = speakeasy.totp.verify({
      secret: twoFactor.secret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (verified) {
      res.json({ verified: true, method: 'totp' });
    } else {
      res.status(401).json({ verified: false, message: 'Invalid code' });
    }
  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ message: 'Failed to verify 2FA' });
  }
});

router.post('/disable', authenticateToken, requireCsrf, async (req, res) => {
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

    const verified = speakeasy.totp.verify({
      secret: twoFactor.secret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (!verified) {
      return res.status(401).json({ message: 'Invalid verification code' });
    }

    await TwoFactor.findOneAndUpdate({ user: userId }, { enabled: false });

    await log2FADisable(userId, req);

    res.json({ message: '2FA disabled successfully' });
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ message: 'Failed to disable 2FA' });
  }
});

router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const twoFactor = await TwoFactor.findOne({ user: userId });

    res.json({
      enabled: twoFactor?.enabled || false,
      hasBackupCodes: twoFactor?.backupCodes?.length > 0,
      pendingSetup: Boolean(twoFactor?.secret && !twoFactor?.enabled)
    });
  } catch (error) {
    console.error('2FA status error:', error);
    res.status(500).json({ message: 'Failed to get 2FA status' });
  }
});

module.exports = router;
