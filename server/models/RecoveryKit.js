const mongoose = require('mongoose');

const trustedContactSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  usernameSnapshot: {
    type: String,
    default: ''
  },
  fingerprint: {
    type: String,
    default: null
  },
  shareIndex: {
    type: Number,
    required: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const shardEnvelopeSchema = new mongoose.Schema({
  recipientUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientUsernameSnapshot: {
    type: String,
    default: ''
  },
  recipientFingerprint: {
    type: String,
    default: null
  },
  shareIndex: {
    type: Number,
    required: true
  },
  encryptedEnvelope: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const recoveryKitSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  label: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  algorithm: {
    type: String,
    default: 'shamir-secret-sharing-v1'
  },
  threshold: {
    type: Number,
    required: true,
    min: 2
  },
  shardCount: {
    type: Number,
    required: true,
    min: 2
  },
  createdByDeviceId: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'rotated', 'revoked'],
    default: 'active'
  },
  trustedContacts: [trustedContactSchema],
  shardEnvelopes: [shardEnvelopeSchema],
  rotatedAt: {
    type: Date,
    default: null
  },
  revokedAt: {
    type: Date,
    default: null
  },
  replacedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RecoveryKit',
    default: null
  }
}, {
  timestamps: true
});

recoveryKitSchema.index({ user: 1, status: 1, createdAt: -1 });
recoveryKitSchema.index({ 'trustedContacts.user': 1, status: 1, createdAt: -1 });
recoveryKitSchema.index({ 'shardEnvelopes.recipientUser': 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('RecoveryKit', recoveryKitSchema);
