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
    enum: [
      'login',
      'logout',
      'password_change',
      '2fa_enable',
      '2fa_disable',
      'message_delete',
      'message_edit',
      'message_moderation',
      'profile_update',
      'device_added',
      'device_removed',
      'user_deleted'
    ]
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
const logMessageDelete = (userId, messageId, req, details = {}) => (
  auditLog(userId, 'message_delete', { messageId, ...details }, req)
);
const logMessageEdit = (userId, messageId, req, details = {}) => (
  auditLog(userId, 'message_edit', { messageId, ...details }, req)
);
const logMessageModeration = (userId, targetId, req, details = {}) => (
  auditLog(userId, 'message_moderation', { targetId, ...details }, req)
);
const logProfileUpdate = (userId, changes, req) => auditLog(userId, 'profile_update', { changes }, req);
const logDeviceAdded = (userId, deviceId, deviceName, req) => auditLog(userId, 'device_added', { deviceId, deviceName }, req);
const logDeviceRemoved = (userId, deviceId, req) => auditLog(userId, 'device_removed', { deviceId }, req);
const logUserDeleted = (userId, req, details = {}) => auditLog(userId, 'user_deleted', details, req);

module.exports = {
  AuditLog,
  auditLog,
  logLogin,
  logLogout,
  logPasswordChange,
  log2FAEnable,
  log2FADisable,
  logMessageDelete,
  logMessageEdit,
  logMessageModeration,
  logProfileUpdate,
  logDeviceAdded,
  logDeviceRemoved,
  logUserDeleted
};

