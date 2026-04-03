const mongoose = require('mongoose');

const twoFactorSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  secret: {
    type: String,
    required: true
  },
  enabled: {
    type: Boolean,
    default: false
  },
  backupCodes: [{
    type: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

twoFactorSchema.index({ user: 1 });

module.exports = mongoose.model('TwoFactor', twoFactorSchema);
