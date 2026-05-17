const mongoose = require('mongoose');

const blockedUserSchema = new mongoose.Schema({
  blocker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  blocked: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reason: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  }
}, {
  timestamps: true
});

blockedUserSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

module.exports = mongoose.model('BlockedUser', blockedUserSchema);
