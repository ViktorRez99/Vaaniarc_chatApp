const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  slug: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
    unique: true
  },
  description: {
    type: String,
    default: '',
    maxlength: 400
  },
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member'
    }
  }],
  community: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    default: null
  },
  settings: {
    allowMemberPosts: {
      type: Boolean,
      default: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

channelSchema.index({ slug: 1 }, { unique: true });
channelSchema.index({ visibility: 1, isActive: 1, lastActivity: -1 });
channelSchema.index({ 'members.user': 1, isActive: 1, lastActivity: -1 });
channelSchema.index({ community: 1, isActive: 1 });

channelSchema.methods.isMember = function(userId) {
  return this.members.some((member) => member.user.toString() === userId.toString());
};

channelSchema.methods.isAdmin = function(userId) {
  return this.owner.toString() === userId.toString()
    || this.admins.some((adminId) => adminId.toString() === userId.toString());
};

channelSchema.methods.canView = function(userId) {
  return this.visibility === 'public' || this.isMember(userId) || this.isAdmin(userId);
};

channelSchema.methods.canPost = function(userId) {
  return this.isAdmin(userId) || (this.settings.allowMemberPosts && this.isMember(userId));
};

channelSchema.methods.addMember = function(userId, role = 'member') {
  if (this.isMember(userId)) {
    return false;
  }

  this.members.push({
    user: userId,
    role,
    joinedAt: new Date()
  });

  if (role === 'owner' || role === 'admin') {
    this.admins.addToSet(userId);
  }

  return true;
};

channelSchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save({ validateBeforeSave: false });
};

module.exports = mongoose.model('Channel', channelSchema);
