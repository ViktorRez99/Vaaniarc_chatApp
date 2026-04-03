const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deviceId: {
    type: String,
    required: true,
    unique: true
  },
  deviceName: {
    type: String,
    default: 'Unknown Device'
  },
  browser: {
    type: String,
    default: 'Browser'
  },
  platform: {
    type: String,
    default: 'Unknown Device'
  },
  userAgent: {
    type: String,
    default: ''
  },
  publicKeyFingerprint: {
    type: String,
    default: null
  },
  keyBundleVersion: {
    type: Number,
    default: 1
  },
  keyBundle: {
    algorithm: {
      type: String,
      default: null
    },
    encryptionPublicKey: {
      type: String,
      default: null
    },
    signingPublicKey: {
      type: String,
      default: null
    },
    fingerprint: {
      type: String,
      default: null
    },
    signedPreKey: {
      id: {
        type: String,
        default: null
      },
      publicKey: {
        type: String,
        default: null
      },
      signature: {
        type: String,
        default: null
      },
      publishedAt: {
        type: Date,
        default: null
      }
    },
    oneTimePreKeys: [{
      id: {
        type: String,
        required: true
      },
      publicKey: {
        type: String,
        required: true
      },
      publishedAt: {
        type: Date,
        default: Date.now
      }
    }],
    publishedAt: {
      type: Date,
      default: null
    }
  },
  identityStatus: {
    type: String,
    enum: ['ready', 'needs_recovery', 'key_mismatch', 'unsupported', 'signed_out', 'error', 'unknown'],
    default: 'unknown'
  },
  linkedAt: {
    type: Date,
    default: Date.now
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  lastIp: {
    type: String,
    default: null
  },
  pushSubscription: {
    endpoint: {
      type: String,
      default: null
    },
    expirationTime: {
      type: Number,
      default: null
    },
    keys: {
      p256dh: {
        type: String,
        default: null
      },
      auth: {
        type: String,
        default: null
      }
    },
    updatedAt: {
      type: Date,
      default: null
    }
  },
  revokedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

deviceSchema.index({ user: 1, revokedAt: 1, lastActive: -1 });
deviceSchema.index({ user: 1, deviceId: 1 });
deviceSchema.index({ user: 1, identityStatus: 1, revokedAt: 1 });
deviceSchema.index({ user: 1, 'keyBundle.signedPreKey.publishedAt': -1 });
deviceSchema.index({ deviceId: 1 });

module.exports = mongoose.model('Device', deviceSchema);
