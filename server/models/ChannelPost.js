const mongoose = require('mongoose');

const channelPostSchema = new mongoose.Schema({
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    text: {
      type: String,
      default: '',
      maxlength: 4000
    }
  },
  messageType: {
    type: String,
    enum: ['text', 'announcement', 'system'],
    default: 'text'
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

channelPostSchema.index({ channel: 1, createdAt: -1 });
channelPostSchema.index({ author: 1, createdAt: -1 });
channelPostSchema.index({ isPinned: -1, createdAt: -1 });

channelPostSchema.methods.editContent = function(nextContent) {
  this.content.text = nextContent;
  this.isEdited = true;
  this.editedAt = new Date();
};

module.exports = mongoose.model('ChannelPost', channelPostSchema);
