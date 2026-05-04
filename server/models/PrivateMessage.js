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
    canPreview: Boolean,
    encryptionPayload: {
      type: String,
      default: null
    }
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
    ref: 'PrivateMessage',
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
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
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
  }
}, {
  timestamps: true
});

privateMessageSchema.index({ chatId: 1, createdAt: -1 });
privateMessageSchema.index({ chatId: 1, read: 1, createdAt: -1 });
privateMessageSchema.index({ chatId: 1, expiresAt: 1, createdAt: -1 });
privateMessageSchema.index({ sender: 1, createdAt: -1 });
privateMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
privateMessageSchema.index({ chatId: 1, sender: 1, tempId: 1 }, { sparse: true });
privateMessageSchema.index({ replyTo: 1, createdAt: -1 });
privateMessageSchema.index({ chatId: 1, isPinned: -1, pinnedAt: -1, createdAt: -1 });

privateMessageSchema.methods.addReaction = function addReaction(userId, emoji) {
  const existingReaction = this.reactions.find((reaction) => (
    reaction.user.toString() === userId.toString() && reaction.emoji === emoji
  ));

  if (existingReaction) {
    return false;
  }

  this.reactions.push({
    user: userId,
    emoji,
    addedAt: new Date()
  });

  return true;
};

privateMessageSchema.methods.removeReaction = function removeReaction(userId, emoji) {
  this.reactions = this.reactions.filter((reaction) => !(
    reaction.user.toString() === userId.toString() && reaction.emoji === emoji
  ));
};

privateMessageSchema.methods.editContent = function editContent(nextContent) {
  this.content = nextContent;
  this.isEdited = true;
  this.editedAt = new Date();
};

privateMessageSchema.methods.softDelete = function softDelete() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.revocableUntil = new Date();
  this.isPinned = false;
  this.pinnedAt = null;
  this.pinnedBy = null;
  this.content = 'This message has been deleted';
  this.encryptedContent = null;
  this.fileUrl = null;
  this.fileMetadata = null;
};

privateMessageSchema.methods.setPinned = function setPinned(nextPinned, userId) {
  this.isPinned = Boolean(nextPinned);
  this.pinnedAt = this.isPinned ? new Date() : null;
  this.pinnedBy = this.isPinned ? userId : null;
};

privateMessageSchema.methods.canEdit = function canEdit(userId) {
  const messageAge = Date.now() - this.createdAt.getTime();
  const maxEditTime = 15 * 60 * 1000;

  return this.sender.toString() === userId.toString()
    && messageAge < maxEditTime
    && !this.isDeleted
    && !this.encryptedContent
    && Number(this.protocolVersion || 1) < 2
    && this.messageType === 'text';
};

privateMessageSchema.methods.canDelete = function canDelete(userId) {
  return this.sender.toString() === userId.toString()
    && (!this.revocableUntil || this.revocableUntil.getTime() > Date.now())
    && !this.isDeleted;
};

module.exports = mongoose.model('PrivateMessage', privateMessageSchema);
