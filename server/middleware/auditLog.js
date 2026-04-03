const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['login', 'logout', 'password_change', '2fa_enable', '2fa_disable', 'message_delete', 'profile_update', 'device_added', 'device_removed']
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

const auditLog = async (userId, action, details = {}, req = null) => {
  try {
    const logEntry = {
      user: userId,
      action,
      details,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent']
    };

    await AuditLog.create(logEntry);
  } catch (error) {
    console.error('Audit log error:', error);
  }
};

const logLogin = (userId, req) => auditLog(userId, 'login', {}, req);
const logLogout = (userId, req) => auditLog(userId, 'logout', {}, req);
const logPasswordChange = (userId, req) => auditLog(userId, 'password_change', {}, req);
const log2FAEnable = (userId, req) => auditLog(userId, '2fa_enable', {}, req);
const log2FADisable = (userId, req) => auditLog(userId, '2fa_disable', {}, req);
const logMessageDelete = (userId, messageId, req) => auditLog(userId, 'message_delete', { messageId }, req);
const logProfileUpdate = (userId, changes, req) => auditLog(userId, 'profile_update', { changes }, req);
const logDeviceAdded = (userId, deviceId, deviceName, req) => auditLog(userId, 'device_added', { deviceId, deviceName }, req);
const logDeviceRemoved = (userId, deviceId, req) => auditLog(userId, 'device_removed', { deviceId }, req);

module.exports = {
  AuditLog,
  auditLog,
  logLogin,
  logLogout,
  logPasswordChange,
  log2FAEnable,
  log2FADisable,
  logMessageDelete,
  logProfileUpdate,
  logDeviceAdded,
  logDeviceRemoved
};

