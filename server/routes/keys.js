const logger = require('../utils/logger');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Device = require('../models/Device');
const DeviceKeyMaterial = require('../models/DeviceKeyMaterial');
const authenticateToken = require('../middleware/auth');
const {
  appendTransparencyEntry,
  getTransparencyLogForUser
} = require('../services/keyTransparencyService');
const { buildTransparencyBundleHash } = require('../utils/keyTransparency');
const {
  buildCryptoProfileHash,
  buildColdPathMaterialHash,
  extractColdPathKeyMaterial,
  mergeHotAndColdKeyBundle,
  normalizeCryptoProfile,
  stripColdPathKeyMaterial
} = require('../utils/cryptoProfile');
const requireCsrf = authenticateToken.requireCsrf;

const buildDeviceKeyMaterialMap = async (devices = []) => {
  if (!devices.length) {
    return new Map();
  }

  const deviceIds = devices
    .map((device) => device.deviceId)
    .filter((deviceId) => typeof deviceId === 'string' && deviceId.trim().length > 0);
  const userId = devices[0]?.user;

  if (!userId || !deviceIds.length) {
    return new Map();
  }

  const materials = await DeviceKeyMaterial.find({
    user: userId,
    deviceId: { $in: deviceIds }
  }).lean();

  return new Map(
    materials.map((material) => [material.deviceId, material])
  );
};

const serializeDeviceRecord = (device, materialMap = new Map()) => {
  const deviceObject = typeof device?.toObject === 'function'
    ? device.toObject()
    : device;
  const material = materialMap.get(deviceObject.deviceId);

  return {
    deviceId: deviceObject.deviceId,
    deviceName: deviceObject.deviceName,
    browser: deviceObject.browser,
    platform: deviceObject.platform,
    keyBundleVersion: deviceObject.keyBundleVersion || 2,
    cryptoProfile: deviceObject.cryptoProfile || null,
    coldPathMaterialHash: deviceObject.coldPathMaterialHash || null,
    keyBundle: mergeHotAndColdKeyBundle(
      deviceObject.keyBundle,
      material?.coldPathMaterial || null
    ),
    publicKeyFingerprint: deviceObject.publicKeyFingerprint,
    lastActive: deviceObject.lastActive,
    linkedAt: deviceObject.linkedAt
  };
};

router.post('/identity', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const { identityKey } = req.body;

    if (!identityKey) {
      return res.status(400).json({ message: 'Identity key is required' });
    }

    await User.findByIdAndUpdate(req.user._id, { identityKey });

    res.json({ message: 'Identity key stored successfully' });
  } catch (error) {
    logger.error('Identity key storage error:', error);
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
    logger.error('Pre-keys storage error:', error);
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
    logger.error('Pre-keys fetch error:', error);
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
    logger.error('Signed pre-key update error:', error);
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
    logger.error('Identity key fetch error:', error);
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

    const existingDevice = await Device.findOne({ user: userId, deviceId }).select(
      'keyBundle keyBundleVersion revokedAt cryptoProfile coldPathMaterialHash'
    );
    const now = new Date();
    const cryptoProfile = normalizeCryptoProfile(keyBundle?.cryptoProfile || {});
    const coldPathMaterial = extractColdPathKeyMaterial(keyBundle);
    const coldPathMaterialHash = buildColdPathMaterialHash(coldPathMaterial);
    const hotKeyBundle = stripColdPathKeyMaterial(keyBundle || {});
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
      keyBundleVersion: Number(hotKeyBundle.version || keyBundle.version || 2),
      cryptoProfile,
      coldPathMaterialHash,
      keyBundle: {
        algorithm: hotKeyBundle.algorithm || 'sealed_box_v2',
        encryptionPublicKey: hotKeyBundle.encryptionPublicKey,
        signingPublicKey: hotKeyBundle.signingPublicKey,
        fingerprint: hotKeyBundle.fingerprint,
        signedPreKey: {
          id: String(hotKeyBundle.signedPreKey.id),
          publicKey: hotKeyBundle.signedPreKey.publicKey,
          signature: hotKeyBundle.signedPreKey.signature,
          pqSignature: hotKeyBundle.signedPreKey.pqSignature || null,
          publishedAt: now
        },
        oneTimePreKeys,
        publishedAt: now
      },
      publicKeyFingerprint: hotKeyBundle.fingerprint,
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

    if (coldPathMaterial) {
      await DeviceKeyMaterial.findOneAndUpdate(
        { user: userId, deviceId },
        {
          $set: {
            user: userId,
            deviceId,
            keyBundleVersion: update.keyBundleVersion,
            cryptoProfile,
            coldPathMaterial,
            materialHash: coldPathMaterialHash,
            publishedAt: now
          }
        },
        {
          upsert: true,
          new: true
        }
      );
    } else {
      await DeviceKeyMaterial.findOneAndDelete({ user: userId, deviceId });
    }

    const previousBundleHash = existingDevice?.keyBundle
      ? buildTransparencyBundleHash(existingDevice.keyBundle, existingDevice.keyBundleVersion || 2)
      : null;
    const nextBundleHash = buildTransparencyBundleHash(update.keyBundle, update.keyBundleVersion || 2);
    const previousCryptoProfileHash = buildCryptoProfileHash(existingDevice?.cryptoProfile || {});
    const nextCryptoProfileHash = buildCryptoProfileHash(cryptoProfile);

    if (
      previousBundleHash !== nextBundleHash
      || previousCryptoProfileHash !== nextCryptoProfileHash
      || (existingDevice?.coldPathMaterialHash || null) !== coldPathMaterialHash
      || existingDevice?.revokedAt
    ) {
      await appendTransparencyEntry({
        userId,
        deviceId,
        action: previousBundleHash ? 'rotate' : 'publish',
        keyBundle: update.keyBundle,
        keyBundleVersion: update.keyBundleVersion,
        cryptoProfile,
        coldPathMaterial,
        fingerprint: update.publicKeyFingerprint,
        occurredAt: now
      });
    }

    const materialMap = await buildDeviceKeyMaterialMap([device]);

    res.status(201).json({
      message: 'Device key bundle stored successfully',
      device: serializeDeviceRecord(device, materialMap)
    });
  } catch (error) {
    logger.error('Device key bundle storage error:', error);
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
    const materialMap = await buildDeviceKeyMaterialMap(devices);

    res.json({
      devices: devices.map((device) => serializeDeviceRecord(device, materialMap))
    });
  } catch (error) {
    logger.error('Device key bundles fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch device key bundles' });
  }
});

router.post('/devices/consume-prekey', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const { userId, deviceId } = req.body || {};

    if (!userId || !deviceId) {
      return res.status(400).json({ message: 'Target user ID and device ID are required.' });
    }

    const device = await Device.findOneAndUpdate(
      {
        user: userId,
        deviceId,
        revokedAt: null,
        'keyBundle.encryptionPublicKey': { $ne: null }
      },
      { $pop: { 'keyBundle.oneTimePreKeys': -1 } },
      { new: false }
    ).select('deviceId deviceName browser platform keyBundle keyBundleVersion publicKeyFingerprint lastActive linkedAt user');

    if (!device) {
      return res.status(404).json({ message: 'No active device bundle found for the requested device.' });
    }

    const oneTimePreKey = Array.isArray(device.keyBundle?.oneTimePreKeys) && device.keyBundle.oneTimePreKeys.length
      ? device.keyBundle.oneTimePreKeys[0]
      : null;

    if (oneTimePreKey) {
      device.keyBundle.oneTimePreKeys = device.keyBundle.oneTimePreKeys.slice(1);
    }

    const materialRecord = await DeviceKeyMaterial.findOneAndUpdate(
      {
        user: userId,
        deviceId,
        'coldPathMaterial.auxiliaryBundles.postQuantum.kem.oneTimePreKeys.0': { $exists: true }
      },
      { $pop: { 'coldPathMaterial.auxiliaryBundles.postQuantum.kem.oneTimePreKeys': -1 } },
      { new: false }
    );

    const postQuantumOneTimePreKey = Array.isArray(materialRecord?.coldPathMaterial?.auxiliaryBundles?.postQuantum?.kem?.oneTimePreKeys)
      && materialRecord.coldPathMaterial.auxiliaryBundles.postQuantum.kem.oneTimePreKeys.length
      ? materialRecord.coldPathMaterial.auxiliaryBundles.postQuantum.kem.oneTimePreKeys[0]
      : null;

    if (postQuantumOneTimePreKey) {
      materialRecord.coldPathMaterial.auxiliaryBundles.postQuantum.kem.oneTimePreKeys =
        materialRecord.coldPathMaterial.auxiliaryBundles.postQuantum.kem.oneTimePreKeys.slice(1);
    }

    const materialMap = await buildDeviceKeyMaterialMap([device]);

    const serializedDevice = serializeDeviceRecord(device, materialMap);
    const serializedPostQuantumKem = serializedDevice.keyBundle?.auxiliaryBundles?.postQuantum?.kem || null;

    res.json({
      device: {
        ...serializedDevice,
        keyBundle: {
          ...serializedDevice.keyBundle,
          oneTimePreKeys: oneTimePreKey ? [oneTimePreKey] : [],
          auxiliaryBundles: serializedDevice.keyBundle?.auxiliaryBundles
            ? {
                ...serializedDevice.keyBundle.auxiliaryBundles,
                postQuantum: serializedDevice.keyBundle.auxiliaryBundles.postQuantum
                  ? {
                      ...serializedDevice.keyBundle.auxiliaryBundles.postQuantum,
                      kem: serializedPostQuantumKem
                        ? {
                            ...serializedPostQuantumKem,
                            oneTimePreKeys: postQuantumOneTimePreKey ? [postQuantumOneTimePreKey] : []
                          }
                        : null
                    }
                  : null
              }
            : null
        }
      }
    });
  } catch (error) {
    logger.error('Device prekey consumption error:', error);
    res.status(500).json({ message: 'Failed to fetch a device prekey bundle' });
  }
});

router.get('/transparency/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const transparencyLog = await getTransparencyLogForUser(userId);

    res.json(transparencyLog);
  } catch (error) {
    logger.error('Key transparency fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch key transparency history' });
  }
});

module.exports = router;
