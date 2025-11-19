const mongoose = require('mongoose');

const privateMessageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'audio', 'video'],
    default: 'text'
  },
  fileUrl: {
    type: String,
    default: null
  },
  fileMetadata: {
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    category: String,
    canPreview: Boolean
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient queries
privateMessageSchema.index({ chatId: 1, createdAt: -1 });
privateMessageSchema.index({ sender: 1, createdAt: -1 });

module.exports = mongoose.model('PrivateMessage', privateMessageSchema);
