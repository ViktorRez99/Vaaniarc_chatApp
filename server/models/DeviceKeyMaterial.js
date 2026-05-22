/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

const mongoose = require('mongoose');

const deviceKeyMaterialSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deviceId: {
    type: String,
    required: true
  },
  keyBundleVersion: {
    type: Number,
    default: 3
  },
  cryptoProfile: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  },
  coldPathMaterial: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  materialHash: {
    type: String,
    default: null
  },
  publishedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

deviceKeyMaterialSchema.index({ user: 1, deviceId: 1 }, { unique: true });
deviceKeyMaterialSchema.index({ user: 1, materialHash: 1 });

module.exports = mongoose.model('DeviceKeyMaterial', deviceKeyMaterialSchema);
