const mongoose = require('mongoose');

const keyTransparencyEntrySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deviceId: {
    type: String,
    required: true
  },
  action: {
    type: String,
    enum: ['publish', 'rotate', 'revoke'],
    required: true
  },
  fingerprint: {
    type: String,
    default: null
  },
  bundleHash: {
    type: String,
    default: null
  },
  keyBundleVersion: {
    type: Number,
    default: 2
  },
  previousEntryHash: {
    type: String,
    default: null
  },
  entryHash: {
    type: String,
    required: true,
    unique: true
  },
  occurredAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

keyTransparencyEntrySchema.index({ user: 1, occurredAt: 1, createdAt: 1 });
keyTransparencyEntrySchema.index({ user: 1, deviceId: 1, occurredAt: 1 });

module.exports = mongoose.model('KeyTransparencyEntry', keyTransparencyEntrySchema);
