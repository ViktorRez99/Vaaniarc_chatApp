const express = require('express');
const router = express.Router();
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const User = require('../models/User');
const TwoFactor = require('../models/TwoFactor');
const authenticateToken = require('../middleware/auth');
const { log2FAEnable, log2FADisable } = require('../middleware/auditLog');
const requireCsrf = authenticateToken.requireCsrf;

router.post('/setup', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const userId = req.user._id;

    const existing = await TwoFactor.findOne({ user: userId, enabled: true });
    if (existing) {
      return res.status(400).json({ message: '2FA is already enabled' });
    }

    const user = await User.findById(userId);
    const secret = speakeasy.generateSecret({
      name: `VaaniArc (@${user?.username || userId})`,
      length: 20
    });

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
    const { token, backupCodes } = req.body;
    const userId = req.user._id;

    const existing = await TwoFactor.findOne({ user: userId });
    if (existing?.enabled) {
      return res.status(400).json({ message: '2FA is already enabled' });
    }

    const verified = speakeasy.totp.verify({
      secret: existing?.secret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (!verified && !existing?.secret) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    const secret = existing?.secret || speakeasy.generateSecret({ name: `VaaniArc (${userId})`, length: 20 }).base32;

    const finalVerified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (!finalVerified) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    const hashedCodes = backupCodes?.map(code => require('bcryptjs').hashSync(code, 10)) || [];

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

    res.json({ message: '2FA enabled successfully' });
  } catch (error) {
    console.error('2FA enable error:', error);
    res.status(500).json({ message: 'Failed to enable 2FA' });
  }
});

router.post('/verify', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user._id;

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
    const { password, token } = req.body;
    const userId = req.user._id;

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
      hasBackupCodes: twoFactor?.backupCodes?.length > 0
    });
  } catch (error) {
    console.error('2FA status error:', error);
    res.status(500).json({ message: 'Failed to get 2FA status' });
  }
});

module.exports = router;
