const Device = require('../models/Device');
const { emitSocketEvent } = require('./socketPayloads');

const normalizeDeviceIds = (deviceIds = []) => [...new Set(
  deviceIds
    .filter((deviceId) => typeof deviceId === 'string' && deviceId.trim().length > 0)
    .map((deviceId) => deviceId.trim())
)];

const normalizeUserIds = (userIds = []) => [...new Set(
  userIds
    .filter(Boolean)
    .map((userId) => userId.toString())
)];

const resolveAuthorizedDeviceIds = async ({ userIds = [], deviceIds = [] }) => {
  const normalizedUserIds = normalizeUserIds(userIds);
  const normalizedDeviceIds = normalizeDeviceIds(deviceIds);

  if (!normalizedUserIds.length || !normalizedDeviceIds.length) {
    return [];
  }

  const devices = await Device.find({
    user: { $in: normalizedUserIds },
    deviceId: { $in: normalizedDeviceIds },
    revokedAt: null
  }).select('deviceId');

  return normalizeDeviceIds(devices.map((device) => device.deviceId));
};

const emitToDeviceRooms = ({ io, eventName, payload, deviceIds = [], excludeDeviceId = null }) => {
  if (!io || !eventName) {
    return 0;
  }

  const normalizedDeviceIds = normalizeDeviceIds(deviceIds)
    .filter((deviceId) => !excludeDeviceId || deviceId !== excludeDeviceId);

  normalizedDeviceIds.forEach((deviceId) => {
    emitSocketEvent(io.to(`device:${deviceId}`), eventName, payload);
  });

  return normalizedDeviceIds.length;
};

module.exports = {
  emitToDeviceRooms,
  normalizeDeviceIds,
  resolveAuthorizedDeviceIds
};
