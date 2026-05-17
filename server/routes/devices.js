const logger = require('../utils/logger');
const express = require('express');

const router = express.Router();
const Device = require('../models/Device');
const { appendTransparencyEntry } = require('../services/keyTransparencyService');
const { logDeviceAdded, logDeviceRemoved } = require('../middleware/auditLog');

const CURRENT_DEVICE_HEADER = 'x-device-id';

const getRequestIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || null;
};

const serializeDevice = (device, currentDeviceId) => ({
  ...device.toObject(),
  isCurrent: device.deviceId === currentDeviceId,
  isRevoked: Boolean(device.revokedAt)
});

router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    const currentDeviceId = req.deviceId || req.headers[CURRENT_DEVICE_HEADER] || null;
    const devices = await Device.find({ user: userId })
      .sort({ revokedAt: 1, lastActive: -1 })
      .select('-__v');

    res.json({
      currentDeviceId,
      devices: devices.map((device) => serializeDevice(device, currentDeviceId))
    });
  } catch (error) {
    logger.error('Devices fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch devices' });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      deviceId,
      deviceName,
      browser,
      platform,
      userAgent,
      publicKeyFingerprint,
      identityStatus
    } = req.body;
    const userId = req.user._id;

    const resolvedDeviceId = req.deviceId || deviceId || null;

    if (!resolvedDeviceId) {
      return res.status(400).json({ message: 'Device ID is required' });
    }

    if (deviceId && req.deviceId && deviceId !== req.deviceId) {
      return res.status(400).json({ message: 'Device ID does not match the authenticated session.' });
    }

    const now = new Date();
    const update = {
      user: userId,
      deviceName: deviceName || 'Unknown Device',
      browser: browser || 'Browser',
      platform: platform || 'Unknown Device',
      userAgent: userAgent || '',
      publicKeyFingerprint: publicKeyFingerprint || null,
      identityStatus: identityStatus || 'unknown',
      lastActive: now,
      lastIp: getRequestIp(req),
      revokedAt: null
    };

    const claimedDevice = await Device.findOne({ deviceId: resolvedDeviceId });
    if (claimedDevice && claimedDevice.user.toString() !== userId.toString()) {
      return res.status(409).json({
        code: 'DEVICE_ID_CLAIMED',
        message: 'Device ID is already linked to another account.'
      });
    }

    let device = await Device.findOne({ deviceId: resolvedDeviceId, user: userId });
    const isNew = !device;

    if (device) {
      Object.assign(device, update);
      await device.save();
    } else {
      device = await Device.create({
        deviceId: resolvedDeviceId,
        linkedAt: now,
        ...update
      });

      await logDeviceAdded(userId, resolvedDeviceId, deviceName, req);
    }

    res.status(isNew ? 201 : 200).json({
      device: serializeDevice(device, resolvedDeviceId),
      isNew
    });
  } catch (error) {
    logger.error('Device registration error:', error);
    res.status(500).json({ message: 'Failed to register device' });
  }
});

router.patch('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const {
      deviceName,
      publicKeyFingerprint,
      identityStatus
    } = req.body;
    const userId = req.user._id;

    const device = await Device.findOne({ deviceId, user: userId });

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    if (deviceName) {
      device.deviceName = deviceName.trim();
    }

    if (publicKeyFingerprint !== undefined) {
      device.publicKeyFingerprint = publicKeyFingerprint || null;
    }

    if (identityStatus) {
      device.identityStatus = identityStatus;
    }

    device.lastActive = new Date();
    device.lastIp = getRequestIp(req);
    await device.save();

    res.json({
      device: serializeDevice(device, req.deviceId || req.headers[CURRENT_DEVICE_HEADER] || null)
    });
  } catch (error) {
    logger.error('Device update error:', error);
    res.status(500).json({ message: 'Failed to update device' });
  }
});

router.delete('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;
    const currentDeviceId = req.deviceId || req.headers[CURRENT_DEVICE_HEADER] || null;

    if (deviceId === currentDeviceId) {
      return res.status(400).json({ message: 'Sign out on this device instead of revoking it from settings.' });
    }

    const device = await Device.findOne({ deviceId, user: userId, revokedAt: null });

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    device.revokedAt = new Date();
    device.lastActive = new Date();
    await device.save();

    if (device.keyBundle?.fingerprint) {
      await appendTransparencyEntry({
        userId,
        deviceId,
        action: 'revoke',
        keyBundleVersion: device.keyBundleVersion || 2,
        fingerprint: device.keyBundle.fingerprint,
        occurredAt: device.revokedAt
      });
    }

    await logDeviceRemoved(userId, deviceId, req);

    res.json({
      message: 'Device revoked successfully',
      device: serializeDevice(device, currentDeviceId)
    });
  } catch (error) {
    logger.error('Device deletion error:', error);
    res.status(500).json({ message: 'Failed to revoke device' });
  }
});

router.post('/:deviceId/activity', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user._id;

    await Device.findOneAndUpdate(
      { deviceId, user: userId, revokedAt: null },
      {
        lastActive: new Date(),
        lastIp: getRequestIp(req)
      }
    );

    res.json({ message: 'Activity updated' });
  } catch (error) {
    logger.error('Device activity update error:', error);
    res.status(500).json({ message: 'Failed to update activity' });
  }
});

module.exports = router;
