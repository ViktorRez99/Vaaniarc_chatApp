const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema({
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
  channels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel'
  }],
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

communitySchema.index({ slug: 1 }, { unique: true });
communitySchema.index({ visibility: 1, isActive: 1 });
communitySchema.index({ 'members.user': 1, isActive: 1 });

communitySchema.methods.isMember = function(userId) {
  return this.members.some((member) => member.user.toString() === userId.toString());
};

communitySchema.methods.isAdmin = function(userId) {
  return this.owner.toString() === userId.toString()
    || this.admins.some((adminId) => adminId.toString() === userId.toString());
};

communitySchema.methods.addMember = function(userId, role = 'member') {
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

communitySchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save({ validateBeforeSave: false });
};

module.exports = mongoose.model('Community', communitySchema);
