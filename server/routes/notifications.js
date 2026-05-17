const logger = require('../utils/logger');
const express = require('express');

const Device = require('../models/Device');
const {
  getVapidConfig,
  hasPushConfiguration,
  serializeSubscription
} = require('../services/pushService');

const router = express.Router();

const getCurrentDevice = async (req) => {
  if (!req.deviceId) {
    return null;
  }

  return Device.findOne({
    user: req.user._id,
    deviceId: req.deviceId,
    revokedAt: null
  });
};

router.get('/notifications/config', async (req, res) => {
  const { publicKey } = getVapidConfig();

  res.json({
    supported: hasPushConfiguration(),
    vapidPublicKey: publicKey
  });
});

router.post('/notifications/subscribe', async (req, res) => {
  try {
    const subscription = req.body?.subscription || req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ message: 'A valid push subscription is required.' });
    }

    const device = await getCurrentDevice(req);
    if (!device) {
      return res.status(404).json({ message: 'Current device not found. Refresh and try again.' });
    }

    device.pushSubscription = serializeSubscription(subscription);
    device.lastActive = new Date();
    await device.save();

    res.json({
      message: 'Push subscription saved.',
      deviceId: device.deviceId
    });
  } catch (error) {
    logger.error('Push subscription save error:', error);
    res.status(500).json({ message: 'Failed to save push subscription.' });
  }
});

router.delete('/notifications/subscribe', async (req, res) => {
  try {
    const device = await getCurrentDevice(req);
    if (!device) {
      return res.json({
        message: 'No push subscription was registered for this device.',
        deviceId: req.deviceId || null,
        skipped: true
      });
    }

    device.pushSubscription = {
      endpoint: null,
      expirationTime: null,
      keys: {
        p256dh: null,
        auth: null
      },
      updatedAt: new Date()
    };
    await device.save();

    res.json({
      message: 'Push subscription removed.',
      deviceId: device.deviceId
    });
  } catch (error) {
    logger.error('Push subscription delete error:', error);
    res.status(500).json({ message: 'Failed to remove push subscription.' });
  }
});

module.exports = router;
