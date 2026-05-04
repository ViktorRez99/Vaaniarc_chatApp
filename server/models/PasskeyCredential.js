const mongoose = require('mongoose');

const passkeyCredentialSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  credentialID: {
    type: String,
    required: true,
    unique: true
  },
  publicKey: {
    type: String,
    required: true
  },
  counter: {
    type: Number,
    default: 0
  },
  transports: [{
    type: String
  }],
  deviceType: {
    type: String,
    enum: ['singleDevice', 'multiDevice'],
    default: 'multiDevice'
  },
  backedUp: {
    type: Boolean,
    default: false
  },
  aaguid: {
    type: String,
    default: null
  },
  webauthnUserID: {
    type: String,
    required: true
  },
  label: {
    type: String,
    trim: true,
    default: 'Passkey'
  },
  deviceId: {
    type: String,
    default: null
  },
  origin: {
    type: String,
    default: null
  },
  lastUsedAt: {
    type: Date,
    default: null
  },
  revokedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

passkeyCredentialSchema.index({ user: 1, revokedAt: 1, lastUsedAt: -1 });
passkeyCredentialSchema.index({ user: 1, credentialID: 1 });
passkeyCredentialSchema.index({ credentialID: 1 }, { unique: true });

module.exports = mongoose.model('PasskeyCredential', passkeyCredentialSchema);
