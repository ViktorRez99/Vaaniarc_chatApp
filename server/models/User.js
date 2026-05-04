const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const cacheService = require('../services/cacheService');
const { validatePassword } = require('../utils/validation');

const EMAIL_REGEX = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
const normalizeOptionalEmail = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue || undefined;
};

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    default: undefined,
    set: normalizeOptionalEmail,
    validate: {
      validator(value) {
        return value == null || EMAIL_REGEX.test(value);
      },
      message: 'Please enter a valid email'
    }
  },
  firstName: {
    type: String,
    trim: true,
    default: ''
  },
  lastName: {
    type: String,
    trim: true,
    default: ''
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  location: {
    type: String,
    trim: true,
    default: ''
  },
  password: {
    type: String,
    required: true,
    minlength: 10,
    maxlength: 128,
    validate: {
      validator(value) {
        return validatePassword(value).isValid;
      },
      message(props) {
        return validatePassword(props.value).error;
      }
    }
  },
  avatar: {
    type: String,
    default: null
  },
  status: {
    type: String,
    default: 'offline',
    enum: ['online', 'offline', 'away', 'busy']
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  bio: {
    type: String,
    maxlength: 200,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  identityKey: {
    type: String,
    default: null
  },
  signedPreKey: {
    keyId: { type: Number, default: 0 },
    publicKey: { type: String, default: null },
    signature: { type: String, default: null },
    timestamp: { type: Date, default: null }
  },
  preKeys: [{
    keyId: Number,
    publicKey: String
  }],
  registrationId: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ username: 1 });
userSchema.index({ status: 1, lastSeen: -1 });

const cleanupUserRelationships = async (userId) => {
  const [
    Session,
    Device,
    Chat,
    PrivateMessage,
    Message,
    Room,
    Channel,
    ChannelPost,
    Community,
    TwoFactor,
    KeyTransparencyEntry,
    PasskeyCredential,
    RecoveryKit
  ] = [
    mongoose.model('Session'),
    mongoose.model('Device'),
    mongoose.model('Chat'),
    mongoose.model('PrivateMessage'),
    mongoose.model('Message'),
    mongoose.model('Room'),
    mongoose.model('Channel'),
    mongoose.model('ChannelPost'),
    mongoose.model('Community'),
    mongoose.model('TwoFactor'),
    mongoose.model('KeyTransparencyEntry'),
    mongoose.model('PasskeyCredential'),
    mongoose.model('RecoveryKit')
  ];

  const userSessions = await Session.find({ user: userId }).select('tokenHash').lean();
  await Promise.all(userSessions.map((session) => cacheService.session.delete(session.tokenHash)));

  const privateChats = await Chat.find({
    type: 'private',
    participants: userId
  }).select('_id').lean();
  const privateChatIds = privateChats.map((chat) => chat._id);
  const now = new Date();

  await Promise.all([
    Session.deleteMany({ user: userId }),
    Device.deleteMany({ user: userId }),
    TwoFactor.deleteMany({ user: userId }),
    KeyTransparencyEntry.deleteMany({ user: userId }),
    PasskeyCredential.deleteMany({ user: userId }),
    RecoveryKit.deleteMany({ user: userId }),
    privateChatIds.length ? PrivateMessage.deleteMany({ chatId: { $in: privateChatIds } }) : Promise.resolve(),
    privateChatIds.length ? Chat.deleteMany({ _id: { $in: privateChatIds } }) : Promise.resolve(),
    PrivateMessage.updateMany(
      { sender: userId, chatId: { $nin: privateChatIds } },
      {
        $set: {
          isDeleted: true,
          deletedAt: now,
          content: 'User account deleted',
          encryptedContent: null,
          fileUrl: null,
          fileMetadata: null,
          revocableUntil: now
        }
      }
    ),
    Message.updateMany(
      { sender: userId },
      {
        $set: {
          isDeleted: true,
          deletedAt: now,
          encryptedContent: null,
          revocableUntil: now,
          'content.text': 'User account deleted',
          'content.file': null
        }
      }
    ),
    Chat.updateMany(
      { participants: userId },
      { $pull: { participants: userId } }
    ),
    Room.updateMany(
      { 'members.user': userId },
      {
        $pull: {
          members: { user: userId },
          admins: userId,
          moderators: userId
        }
      }
    ),
    Room.updateMany(
      { creator: userId },
      { $set: { isActive: false } }
    ),
    Channel.updateMany(
      { 'members.user': userId },
      {
        $pull: {
          members: { user: userId },
          admins: userId
        }
      }
    ),
    Channel.updateMany(
      { owner: userId },
      { $set: { isActive: false } }
    ),
    Community.updateMany(
      { 'members.user': userId },
      {
        $pull: {
          members: { user: userId },
          admins: userId
        }
      }
    ),
    Community.updateMany(
      { owner: userId },
      { $set: { isActive: false } }
    ),
    ChannelPost.deleteMany({ author: userId })
  ]);
};

const loadUserIdForQuery = async (queryContext) => {
  const existingUser = await queryContext.model.findOne(queryContext.getFilter()).select('_id').lean();
  return existingUser?._id || null;
};

userSchema.pre('deleteOne', { document: true, query: false }, async function(next) {
  try {
    await cleanupUserRelationships(this._id);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.pre('deleteOne', { document: false, query: true }, async function(next) {
  try {
    const userId = await loadUserIdForQuery(this);
    if (userId) {
      await cleanupUserRelationships(userId);
    }
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.pre('findOneAndDelete', async function(next) {
  try {
    const userId = await loadUserIdForQuery(this);
    if (userId) {
      await cleanupUserRelationships(userId);
    }
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

userSchema.methods.updateLastSeen = function() {
  this.lastSeen = new Date();
  return this.save({ validateBeforeSave: false });
};

userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

userSchema.statics.ensureOptionalEmailIndex = async function ensureOptionalEmailIndex() {
  const existingIndexes = await this.collection.indexes();
  const emailIndexes = existingIndexes.filter((index) => index.key?.email === 1);
  const expectedEmailIndexes = emailIndexes.filter((index) => index.unique === true && index.sparse === true);
  const preservedIndexName = expectedEmailIndexes.length === 1 ? expectedEmailIndexes[0].name : null;

  for (const index of emailIndexes) {
    if (index.name === '_id_') {
      continue;
    }

    if (preservedIndexName && index.name === preservedIndexName) {
      continue;
    }

    await this.collection.dropIndex(index.name);
  }

  if (!preservedIndexName) {
    await this.collection.createIndex(
      { email: 1 },
      { name: 'email_1', unique: true, sparse: true }
    );
  }
};

module.exports = mongoose.model('User', userSchema);
