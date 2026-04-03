const mongoose = require('mongoose');
const {
  buildPrivateParticipantHash,
  normalizePrivateParticipantIds
} = require('../utils/chatParticipants');

const chatSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  type: {
    type: String,
    enum: ['private', 'group'],
    default: 'private'
  },
  participantHash: {
    type: String,
    default: undefined
  },
  name: {
    type: String,
    default: ''
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PrivateMessage'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
chatSchema.index({ participants: 1, updatedAt: -1 });
chatSchema.index({ type: 1, updatedAt: -1 });
chatSchema.index({ participantHash: 1 }, { unique: true, sparse: true });

chatSchema.pre('validate', function(next) {
  if (this.type !== 'private') {
    this.participantHash = undefined;
    return next();
  }

  const normalizedParticipants = normalizePrivateParticipantIds(this.participants);
  if (normalizedParticipants.length !== 2) {
    return next(new Error('Private chats must contain exactly two unique participants.'));
  }

  this.participants = normalizedParticipants;
  this.participantHash = buildPrivateParticipantHash(normalizedParticipants);
  return next();
});

module.exports = mongoose.model('Chat', chatSchema);
