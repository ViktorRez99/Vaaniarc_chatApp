const Device = require('../models/Device');
const authenticateToken = require('./auth');
const cacheService = require('../services/cacheService');
const { isDatabaseReady } = require('../services/databaseService');
const { getPasskeyEnrollmentStatus } = require('../utils/passkeyEnrollment');

const socketAuth = async (socket, next) => {
  try {
    if (!isDatabaseReady()) {
      return next(new Error('Authentication error: Database unavailable'));
    }

    const forwardedFor = socket.handshake.headers['x-forwarded-for'];
    const remoteAddress = typeof forwardedFor === 'string' && forwardedFor.trim()
      ? forwardedFor.split(',')[0].trim()
      : (socket.handshake.address || 'unknown');
    const requestedDeviceId = typeof socket.handshake.headers['x-device-id'] === 'string'
      ? socket.handshake.headers['x-device-id'].trim()
      : 'unknown-device';
    const rateLimitKey = `socket-auth::${remoteAddress}::${requestedDeviceId}`;
    const { count: attempts } = await cacheService.rateLimit.increment(rateLimitKey, 15 * 60 * 1000);

    if (attempts > 10) {
      return next(new Error('Authentication error: Too many connection attempts'));
    }

    const authContext = await authenticateToken.resolveAuthentication({
      headers: socket.handshake.headers,
      ip: remoteAddress
    });

    if (!authContext || authContext.authStrategy !== 'session' || !authContext.session) {
      return next(new Error('Authentication error: Session required'));
    }

    const passkeyStatus = await getPasskeyEnrollmentStatus(authContext.user._id);
    if (passkeyStatus.passkeyRequired) {
      return next(new Error('Authentication error: Passkey setup required'));
    }

    socket.userId = authContext.user._id.toString();
    socket.username = authContext.user.username;
    socket.user = authContext.user;
    socket.session = authContext.session;
    socket.deviceId = authContext.session.deviceId || null;

    if (socket.deviceId) {
      const device = await Device.findOne({
        deviceId: socket.deviceId,
        user: authContext.user._id,
        revokedAt: null
      }).select('-__v');

      if (!device) {
        return next(new Error('Authentication error: Device not registered or revoked'));
      }

      socket.device = device;
    }

    return next();
  } catch (error) {
    return next(new Error('Authentication error: Invalid session'));
  }
};

module.exports = socketAuth;
