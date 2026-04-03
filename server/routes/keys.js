const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Device = require('../models/Device');
const authenticateToken = require('../middleware/auth');
const {
  appendTransparencyEntry,
  getTransparencyLogForUser
} = require('../services/keyTransparencyService');
const { buildTransparencyBundleHash } = require('../utils/keyTransparency');
const requireCsrf = authenticateToken.requireCsrf;

router.post('/identity', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const { identityKey } = req.body;

    if (!identityKey) {
      return res.status(400).json({ message: 'Identity key is required' });
    }

    await User.findByIdAndUpdate(req.user._id, { identityKey });

    res.json({ message: 'Identity key stored successfully' });
  } catch (error) {
    console.error('Identity key storage error:', error);
    res.status(500).json({ message: 'Failed to store identity key' });
  }
});

router.post('/prekeys', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const { identityKey, signedPreKey, preKeys, registrationId } = req.body;
    const userId = req.user._id;

    await User.findByIdAndUpdate(userId, {
      identityKey,
      signedPreKey,
      preKeys,
      registrationId
    });

    res.json({ message: 'Pre-keys stored successfully' });
  } catch (error) {
    console.error('Pre-keys storage error:', error);
    res.status(500).json({ message: 'Failed to store pre-keys' });
  }
});

router.get('/prekeys/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('identityKey signedPreKey preKeys registrationId');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.identityKey || !user.signedPreKey || !user.preKeys || user.preKeys.length === 0) {
      return res.status(404).json({ message: 'User has not set up encryption keys yet' });
    }

    res.json({
      identityKey: user.identityKey,
      signedPreKey: user.signedPreKey,
      preKeys: user.preKeys,
      registrationId: user.registrationId
    });
  } catch (error) {
    console.error('Pre-keys fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch pre-keys' });
  }
});

router.post('/signed', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const { signedPreKey } = req.body;
    const userId = req.user._id;

    await User.findByIdAndUpdate(userId, { signedPreKey });

    res.json({ message: 'Signed pre-key updated successfully' });
  } catch (error) {
    console.error('Signed pre-key update error:', error);
    res.status(500).json({ message: 'Failed to update signed pre-key' });
  }
});

router.get('/identity/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('identityKey username');

    if (!user || !user.identityKey) {
      return res.status(404).json({ message: 'User identity key not found' });
    }

    res.json({
      identityKey: user.identityKey,
      username: user.username
    });
  } catch (error) {
    console.error('Identity key fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch identity key' });
  }
});

router.post('/devices/register', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const {
      deviceId: providedDeviceId,
      keyBundle
    } = req.body;
    const userId = req.user._id;
    const deviceId = req.deviceId || providedDeviceId || null;

    if (!deviceId) {
      return res.status(400).json({ message: 'Device ID is required' });
    }

    if (providedDeviceId && req.deviceId && providedDeviceId !== req.deviceId) {
      return res.status(400).json({ message: 'Device ID does not match the authenticated session.' });
    }

    if (!keyBundle?.encryptionPublicKey || !keyBundle?.signingPublicKey || !keyBundle?.fingerprint) {
      return res.status(400).json({ message: 'A complete device key bundle is required' });
    }

    if (!keyBundle?.signedPreKey?.id || !keyBundle?.signedPreKey?.publicKey || !keyBundle?.signedPreKey?.signature) {
      return res.status(400).json({ message: 'A signed prekey is required for device encryption.' });
    }

    const existingDevice = await Device.findOne({ user: userId, deviceId }).select('keyBundle keyBundleVersion revokedAt');
    const now = new Date();
    const oneTimePreKeys = Array.isArray(keyBundle?.oneTimePreKeys)
      ? keyBundle.oneTimePreKeys
        .filter((preKey) => preKey?.id && preKey?.publicKey)
        .map((preKey) => ({
          id: String(preKey.id),
          publicKey: preKey.publicKey,
          publishedAt: now
        }))
      : [];
    const update = {
      user: userId,
      keyBundleVersion: Number(keyBundle.version || 2),
      keyBundle: {
        algorithm: keyBundle.algorithm || 'sealed_box_v2',
        encryptionPublicKey: keyBundle.encryptionPublicKey,
        signingPublicKey: keyBundle.signingPublicKey,
        fingerprint: keyBundle.fingerprint,
        signedPreKey: {
          id: String(keyBundle.signedPreKey.id),
          publicKey: keyBundle.signedPreKey.publicKey,
          signature: keyBundle.signedPreKey.signature,
          publishedAt: now
        },
        oneTimePreKeys,
        publishedAt: now
      },
      publicKeyFingerprint: keyBundle.fingerprint,
      identityStatus: 'ready',
      lastActive: now,
      revokedAt: null
    };

    const device = await Device.findOneAndUpdate(
      { user: userId, deviceId },
      {
        $set: update,
        $setOnInsert: {
          deviceId,
          linkedAt: now
        }
      },
      {
        new: true,
        upsert: true
      }
    ).select('-__v');

    const previousBundleHash = existingDevice?.keyBundle
      ? buildTransparencyBundleHash(existingDevice.keyBundle, existingDevice.keyBundleVersion || 2)
      : null;
    const nextBundleHash = buildTransparencyBundleHash(update.keyBundle, update.keyBundleVersion || 2);

    if (previousBundleHash !== nextBundleHash || existingDevice?.revokedAt) {
      await appendTransparencyEntry({
        userId,
        deviceId,
        action: previousBundleHash ? 'rotate' : 'publish',
        keyBundle: update.keyBundle,
        keyBundleVersion: update.keyBundleVersion,
        fingerprint: update.publicKeyFingerprint,
        occurredAt: now
      });
    }

    res.status(201).json({
      message: 'Device key bundle stored successfully',
      device
    });
  } catch (error) {
    console.error('Device key bundle storage error:', error);
    res.status(500).json({ message: 'Failed to store device key bundle' });
  }
});

router.get('/devices/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const devices = await Device.find({
      user: userId,
      revokedAt: null,
      'keyBundle.encryptionPublicKey': { $ne: null }
    })
      .sort({ lastActive: -1 })
      .select('deviceId deviceName browser platform keyBundle keyBundleVersion publicKeyFingerprint lastActive linkedAt user');

    if (!devices.length) {
      return res.status(404).json({ message: 'No active device bundles found for this user' });
    }

    res.json({
      devices: devices.map((device) => ({
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        browser: device.browser,
        platform: device.platform,
        keyBundleVersion: device.keyBundleVersion || 2,
        keyBundle: device.keyBundle,
        publicKeyFingerprint: device.publicKeyFingerprint,
        lastActive: device.lastActive,
        linkedAt: device.linkedAt
      }))
    });
  } catch (error) {
    console.error('Device key bundles fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch device key bundles' });
  }
});

router.post('/devices/consume-prekey', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const { userId, deviceId } = req.body || {};

    if (!userId || !deviceId) {
      return res.status(400).json({ message: 'Target user ID and device ID are required.' });
    }

    const device = await Device.findOne({
      user: userId,
      deviceId,
      revokedAt: null,
      'keyBundle.encryptionPublicKey': { $ne: null }
    }).select('deviceId deviceName browser platform keyBundle keyBundleVersion publicKeyFingerprint lastActive linkedAt user');

    if (!device) {
      return res.status(404).json({ message: 'No active device bundle found for the requested device.' });
    }

    const oneTimePreKey = Array.isArray(device.keyBundle?.oneTimePreKeys) && device.keyBundle.oneTimePreKeys.length
      ? device.keyBundle.oneTimePreKeys.shift()
      : null;

    if (oneTimePreKey) {
      await device.save();
    }

    res.json({
      device: {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        browser: device.browser,
        platform: device.platform,
        keyBundleVersion: device.keyBundleVersion || 2,
        keyBundle: {
          ...(typeof device.keyBundle?.toObject === 'function' ? device.keyBundle.toObject() : device.keyBundle),
          oneTimePreKeys: oneTimePreKey ? [oneTimePreKey] : []
        },
        publicKeyFingerprint: device.publicKeyFingerprint,
        lastActive: device.lastActive,
        linkedAt: device.linkedAt
      }
    });
  } catch (error) {
    console.error('Device prekey consumption error:', error);
    res.status(500).json({ message: 'Failed to fetch a device prekey bundle' });
  }
});

router.get('/transparency/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const transparencyLog = await getTransparencyLogForUser(userId);

    res.json(transparencyLog);
  } catch (error) {
    console.error('Key transparency fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch key transparency history' });
  }
});

module.exports = router;
