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
      url: String
    }
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
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
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
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
messageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
messageSchema.index({ isDeleted: 1, createdAt: -1 });

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
  this.content.text = 'This message has been deleted';
  if (this.content.file) {
    this.content.file = null;
  }
};

// Check if user can edit this message
messageSchema.methods.canEdit = function(userId) {
  const messageAge = Date.now() - this.createdAt.getTime();
  const maxEditTime = 15 * 60 * 1000; // 15 minutes
  
  return this.sender.toString() === userId.toString() && 
         messageAge < maxEditTime && 
         !this.isDeleted;
};

// Check if user can delete this message
messageSchema.methods.canDelete = function(userId) {
  const messageAge = Date.now() - this.createdAt.getTime();
  const maxDeleteTime = 60 * 60 * 1000; // 1 hour
  
  return this.sender.toString() === userId.toString() && 
         messageAge < maxDeleteTime && 
         !this.isDeleted;
};

// Virtual for formatted timestamp
messageSchema.virtual('formattedTime').get(function() {
  return this.createdAt.toLocaleTimeString();
});

// Transform output to include virtual fields
messageSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Message', messageSchema);
