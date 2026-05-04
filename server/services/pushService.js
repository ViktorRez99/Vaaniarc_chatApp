const webpush = require('web-push');

const Device = require('../models/Device');
const { normalizeId } = require('../utils/idHelpers');
const logger = require('../utils/logger');

let isConfigured = false;
let invalidConfigurationWarningLogged = false;

const getVapidConfig = () => ({
  publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY || null,
  privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY || null,
  subject: process.env.WEB_PUSH_SUBJECT || null
});

const ensureConfigured = () => {
  if (isConfigured) {
    return true;
  }

  const { publicKey, privateKey, subject } = getVapidConfig();
  if (!publicKey || !privateKey || !subject) {
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    isConfigured = true;
    invalidConfigurationWarningLogged = false;
    return true;
  } catch (error) {
    if (!invalidConfigurationWarningLogged) {
      logger.warn('Web push VAPID configuration is invalid; push notifications disabled', {
        message: error.message
      });
      invalidConfigurationWarningLogged = true;
    }
    isConfigured = false;
    return false;
  }
};

const hasPushConfiguration = () => ensureConfigured();

const serializeSubscription = (subscription = {}) => ({
  endpoint: subscription.endpoint || null,
  expirationTime: subscription.expirationTime ?? null,
  keys: {
    p256dh: subscription.keys?.p256dh || null,
    auth: subscription.keys?.auth || null
  },
  updatedAt: new Date()
});

const hasSocketsInRoom = async (io, roomName) => {
  if (typeof io?.in === 'function') {
    const roomScope = io.in(roomName);
    if (roomScope && typeof roomScope.fetchSockets === 'function') {
      const sockets = await roomScope.fetchSockets();
      return sockets.length > 0;
    }
  }

  const room = io?.sockets?.adapter?.rooms?.get(roomName);
  return Boolean(room && room.size > 0);
};

const getOfflineUserIds = async (io, userIds = []) => {
  const normalizedUserIds = [...new Set(
    userIds
      .map((userId) => normalizeId(userId))
      .filter(Boolean)
  )];
  const offlineUserIds = [];

  for (const userId of normalizedUserIds) {
    const isOnline = await hasSocketsInRoom(io, `user:${userId}`);
    if (!isOnline) {
      offlineUserIds.push(userId);
    }
  }

  return offlineUserIds;
};

const deleteSubscriptionForDevice = async (deviceId) => {
  await Device.updateOne(
    { deviceId },
    {
      $set: {
        'pushSubscription.endpoint': null,
        'pushSubscription.expirationTime': null,
        'pushSubscription.keys.p256dh': null,
        'pushSubscription.keys.auth': null,
        'pushSubscription.updatedAt': new Date()
      }
    }
  );
};

const deliverNotification = async (device, payload) => {
  try {
    await webpush.sendNotification({
      endpoint: device.pushSubscription.endpoint,
      expirationTime: device.pushSubscription.expirationTime,
      keys: {
        p256dh: device.pushSubscription.keys?.p256dh,
        auth: device.pushSubscription.keys?.auth
      }
    }, JSON.stringify(payload));
    return true;
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) {
      await deleteSubscriptionForDevice(device.deviceId);
    }

    logger.error('Web push delivery failed', {
      deviceId: device.deviceId,
      statusCode: error.statusCode,
      message: error.message
    });
    return false;
  }
};

const buildDirectMessagePayload = ({ message }) => ({
  title: 'VaaniArc',
  body: 'Open VaaniArc to read a new secure message.',
  url: '/chat',
  tag: `dm:${normalizeId(message?.chatId) || 'message'}`
});

const buildRoomMessagePayload = ({ room, message }) => ({
  title: 'VaaniArc',
  body: 'Open VaaniArc to read new secure messages.',
  url: '/chat',
  tag: `room:${normalizeId(room?._id || room) || 'message'}`
});

const sendNotificationsToUserIds = async ({
  io,
  userIds = [],
  excludeUserIds = [],
  payloadBuilder,
  context = {}
}) => {
  if (typeof payloadBuilder !== 'function' || !ensureConfigured()) {
    return { sent: 0, skipped: true };
  }

  const excluded = new Set(
    excludeUserIds
      .map((userId) => normalizeId(userId))
      .filter(Boolean)
  );

  const targetUserIds = [...new Set(
    userIds
      .map((userId) => normalizeId(userId))
      .filter(Boolean)
      .filter((userId) => !excluded.has(userId))
  )];

  const offlineUserIds = await getOfflineUserIds(io, targetUserIds);
  if (!offlineUserIds.length) {
    return { sent: 0, skipped: true };
  }

  const devices = await Device.find({
    user: { $in: offlineUserIds },
    revokedAt: null,
    'pushSubscription.endpoint': { $ne: null }
  }).select('user deviceId pushSubscription');

  let sent = 0;
  for (const device of devices) {
    const payload = payloadBuilder({
      ...context,
      targetUserId: normalizeId(device.user)
    });

    if (!payload) {
      continue;
    }

    const delivered = await deliverNotification(device, payload);
    if (delivered) {
      sent += 1;
    }
  }

  return {
    sent,
    targetedUsers: offlineUserIds.length
  };
};

module.exports = {
  buildDirectMessagePayload,
  buildRoomMessagePayload,
  getVapidConfig,
  getOfflineUserIds,
  hasPushConfiguration,
  sendNotificationsToUserIds,
  serializeSubscription
};
