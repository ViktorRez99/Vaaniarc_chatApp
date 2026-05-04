const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null for room messages
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    default: null // null for private messages
  },
  content: {
    text: {
      type: String,
      maxlength: 2000
    },
    file: {
      filename: String,
      originalName: String,
      mimetype: String,
      size: Number,
      url: String,
      category: String,
      canPreview: Boolean,
      encryptionPayload: {
        type: String,
        default: null
      }
    }
  },
  encryptedContent: {
    type: String,
    default: null
  },
  protocolVersion: {
    type: Number,
    default: 1
  },
  senderDeviceId: {
    type: String,
    default: null
  },
  tempId: {
    type: String,
    default: null
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'audio', 'video', 'system'],
    default: 'text'
  },
  isPrivate: {
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
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  expiresInSeconds: {
    type: Number,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null
  },
  revocableUntil: {
    type: Date,
    default: () => new Date(Date.now() + (15 * 60 * 1000))
  },
  isViewOnce: {
    type: Boolean,
    default: false
  },
  viewOnceConsumedAt: {
    type: Date,
    default: null
  },
  viewedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  }],
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
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
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  forwardedFrom: {
    originalMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    originalSender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    originalSenderName: {
      type: String,
      default: ''
    },
    sourceType: {
      type: String,
      enum: ['chat', 'room'],
      default: 'chat'
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    }
  },
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isPinned: {
    type: Boolean,
    default: false
  },
  pinnedAt: {
    type: Date,
    default: null
  },
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    location: String
  }
}, {
  timestamps: true
});

// Indexes for better query performance
messageSchema.index({ room: 1, createdAt: -1 });
messageSchema.index({ room: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ room: 1, expiresAt: 1, createdAt: -1 });
messageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
messageSchema.index({ isDeleted: 1, createdAt: -1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
messageSchema.index({ room: 1, sender: 1, tempId: 1 }, { sparse: true });
messageSchema.index({ replyTo: 1, createdAt: -1 });
messageSchema.index({ room: 1, isPinned: -1, pinnedAt: -1, createdAt: -1 });

// Mark message as read by user
messageSchema.methods.markAsRead = function(userId) {
  const existingRead = this.readBy.find(read => 
    read.user.toString() === userId.toString()
  );
  
  if (!existingRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
  }
};

// Add reaction to message
messageSchema.methods.addReaction = function(userId, emoji) {
  const existingReaction = this.reactions.find(reaction => 
    reaction.user.toString() === userId.toString() && reaction.emoji === emoji
  );
  
  if (existingReaction) {
    return false; // Reaction already exists
  }
  
  this.reactions.push({
    user: userId,
    emoji: emoji,
    addedAt: new Date()
  });
  
  return true;
};

// Remove reaction from message
messageSchema.methods.removeReaction = function(userId, emoji) {
  this.reactions = this.reactions.filter(reaction => 
    !(reaction.user.toString() === userId.toString() && reaction.emoji === emoji)
  );
};

// Edit message content
messageSchema.methods.editContent = function(newContent) {
  if (this.messageType === 'text') {
    this.content.text = newContent;
    this.isEdited = true;
    this.editedAt = new Date();
  }
};

// Soft delete message
messageSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.revocableUntil = new Date();
  this.isPinned = false;
  this.pinnedAt = null;
  this.pinnedBy = null;
  this.encryptedContent = null;
  this.content.text = 'This message has been deleted';
  if (this.content.file) {
    this.content.file = null;
  }
};

messageSchema.methods.setPinned = function(userId, nextPinned) {
  this.isPinned = Boolean(nextPinned);
  this.pinnedAt = this.isPinned ? new Date() : null;
  this.pinnedBy = this.isPinned ? userId : null;
};

// Check if user can edit this message
messageSchema.methods.canEdit = function(userId) {
  const messageAge = Date.now() - this.createdAt.getTime();
  const maxEditTime = 15 * 60 * 1000; // 15 minutes
  
  return this.sender.toString() === userId.toString() && 
         messageAge < maxEditTime && 
         !this.isDeleted &&
         !this.encryptedContent &&
         Number(this.protocolVersion || 1) < 2;
};

// Check if user can delete this message
messageSchema.methods.canDelete = function(userId) {
  return this.sender.toString() === userId.toString() && 
         (!this.revocableUntil || this.revocableUntil.getTime() > Date.now()) &&
         !this.isDeleted;
};

// Virtual for formatted timestamp
messageSchema.virtual('formattedTime').get(function() {
  return this.createdAt.toLocaleTimeString();
});

// Transform output to include virtual fields
messageSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Message', messageSchema);
