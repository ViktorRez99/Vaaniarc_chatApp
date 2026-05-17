const logger = require('../utils/logger');
const express = require('express');

const authenticateToken = require('../middleware/auth');
const RecoveryKit = require('../models/RecoveryKit');
const User = require('../models/User');

const router = express.Router();
const requireCsrf = authenticateToken.requireCsrf;

const normalizeString = (value) => typeof value === 'string' ? value.trim() : '';

const normalizeContactPayload = (contacts = []) => {
  if (!Array.isArray(contacts)) {
    return [];
  }

  return contacts
    .map((contact) => ({
      userId: normalizeString(contact?.userId),
      fingerprint: normalizeString(contact?.fingerprint) || null,
      shareIndex: Number.parseInt(contact?.shareIndex, 10)
    }))
    .filter((contact) => contact.userId && Number.isInteger(contact.shareIndex) && contact.shareIndex > 0);
};

const normalizeShardPayload = (shardEnvelopes = []) => {
  if (!Array.isArray(shardEnvelopes)) {
    return [];
  }

  return shardEnvelopes
    .map((shard) => ({
      recipientUserId: normalizeString(shard?.recipientUserId),
      recipientFingerprint: normalizeString(shard?.recipientFingerprint) || null,
      shareIndex: Number.parseInt(shard?.shareIndex, 10),
      encryptedEnvelope: typeof shard?.encryptedEnvelope === 'string' ? shard.encryptedEnvelope.trim() : ''
    }))
    .filter((shard) => (
      shard.recipientUserId
      && Number.isInteger(shard.shareIndex)
      && shard.shareIndex > 0
      && shard.encryptedEnvelope
    ));
};

const serializeRecoveryKit = (kit) => ({
  id: kit._id,
  label: kit.label,
  algorithm: kit.algorithm,
  threshold: kit.threshold,
  shardCount: kit.shardCount,
  status: kit.status,
  createdByDeviceId: kit.createdByDeviceId || null,
  createdAt: kit.createdAt,
  updatedAt: kit.updatedAt,
  rotatedAt: kit.rotatedAt,
  revokedAt: kit.revokedAt,
  trustedContacts: (kit.trustedContacts || []).map((contact) => ({
    userId: contact.user?._id?.toString?.() || contact.user?.toString?.() || null,
    username: contact.user?.username || contact.usernameSnapshot || '',
    avatar: contact.user?.avatar || null,
    fingerprint: contact.fingerprint || null,
    shareIndex: contact.shareIndex
  })),
  shardEnvelopeCount: Array.isArray(kit.shardEnvelopes) ? kit.shardEnvelopes.length : 0
});

const ensureRecoveryPayload = async ({ currentUserId, contacts, shardEnvelopes, threshold }) => {
  if (contacts.length < 2) {
    return 'Select at least two trusted contacts.';
  }

  if (shardEnvelopes.length !== contacts.length) {
    return 'Each trusted contact must have exactly one encrypted shard envelope.';
  }

  if (!Number.isInteger(threshold) || threshold < 2 || threshold > contacts.length) {
    return 'Threshold must be at least 2 and no greater than the number of trusted contacts.';
  }

  const duplicateContactIds = new Set();
  for (const contact of contacts) {
    if (contact.userId === currentUserId) {
      return 'Do not add your own account as a trusted recovery contact.';
    }

    if (duplicateContactIds.has(contact.userId)) {
      return 'Each trusted recovery contact can only be selected once.';
    }

    duplicateContactIds.add(contact.userId);
  }

  const shareIndexes = new Set();
  for (const contact of contacts) {
    shareIndexes.add(contact.shareIndex);
  }

  for (const shard of shardEnvelopes) {
    if (!duplicateContactIds.has(shard.recipientUserId)) {
      return 'Shard envelopes must target one of the selected trusted contacts.';
    }

    if (!shareIndexes.has(shard.shareIndex)) {
      return 'Shard envelope indexes must match the trusted contacts you selected.';
    }
  }

  const existingUsers = await User.find({
    _id: {
      $in: contacts.map((contact) => contact.userId)
    },
    isActive: true
  }).select('username avatar');

  if (existingUsers.length !== contacts.length) {
    return 'One or more trusted contacts could not be found.';
  }

  return existingUsers;
};

const buildRecoveryKitDocument = ({ existingUsers, label, threshold, shardEnvelopes, contacts, currentUserId, currentDeviceId }) => {
  const userLookup = new Map(existingUsers.map((user) => [user._id.toString(), user]));

  return {
    user: currentUserId,
    label,
    threshold,
    shardCount: contacts.length,
    createdByDeviceId: currentDeviceId || null,
    trustedContacts: contacts.map((contact) => ({
      user: contact.userId,
      usernameSnapshot: userLookup.get(contact.userId)?.username || '',
      fingerprint: contact.fingerprint || null,
      shareIndex: contact.shareIndex
    })),
    shardEnvelopes: shardEnvelopes.map((shard) => ({
      recipientUser: shard.recipientUserId,
      recipientUsernameSnapshot: userLookup.get(shard.recipientUserId)?.username || '',
      recipientFingerprint: shard.recipientFingerprint || null,
      shareIndex: shard.shareIndex,
      encryptedEnvelope: shard.encryptedEnvelope
    }))
  };
};

router.get('/kits', authenticateToken, async (req, res) => {
  try {
    const kits = await RecoveryKit.find({ user: req.user._id })
      .populate('trustedContacts.user', 'username avatar')
      .sort({ status: 1, createdAt: -1 });

    res.json({
      kits: kits.map((kit) => serializeRecoveryKit(kit))
    });
  } catch (error) {
    logger.error('Recovery kit list error:', error);
    res.status(500).json({ message: 'Failed to load recovery kits.' });
  }
});

router.post('/kits', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const label = normalizeString(req.body?.label) || 'Recovery Kit';
    const threshold = Number.parseInt(req.body?.threshold, 10);
    const contacts = normalizeContactPayload(req.body?.contacts);
    const shardEnvelopes = normalizeShardPayload(req.body?.shardEnvelopes);

    const validationResult = await ensureRecoveryPayload({
      currentUserId: req.user._id.toString(),
      contacts,
      shardEnvelopes,
      threshold
    });

    if (typeof validationResult === 'string') {
      return res.status(400).json({ message: validationResult });
    }

    const recoveryKit = await RecoveryKit.create(buildRecoveryKitDocument({
      existingUsers: validationResult,
      label,
      threshold,
      shardEnvelopes,
      contacts,
      currentUserId: req.user._id,
      currentDeviceId: req.deviceId || null
    }));

    const populatedKit = await RecoveryKit.findById(recoveryKit._id)
      .populate('trustedContacts.user', 'username avatar');

    res.status(201).json({
      message: 'Recovery kit saved successfully.',
      kit: serializeRecoveryKit(populatedKit)
    });
  } catch (error) {
    logger.error('Recovery kit creation error:', error);
    res.status(500).json({ message: 'Failed to save the recovery kit.' });
  }
});

router.post('/kits/:kitId/rotate', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const currentKit = await RecoveryKit.findOne({
      _id: req.params.kitId,
      user: req.user._id,
      status: 'active'
    });

    if (!currentKit) {
      return res.status(404).json({ message: 'Active recovery kit not found.' });
    }

    const label = normalizeString(req.body?.label) || currentKit.label;
    const threshold = Number.parseInt(req.body?.threshold, 10);
    const contacts = normalizeContactPayload(req.body?.contacts);
    const shardEnvelopes = normalizeShardPayload(req.body?.shardEnvelopes);

    const validationResult = await ensureRecoveryPayload({
      currentUserId: req.user._id.toString(),
      contacts,
      shardEnvelopes,
      threshold
    });

    if (typeof validationResult === 'string') {
      return res.status(400).json({ message: validationResult });
    }

    const nextKit = await RecoveryKit.create(buildRecoveryKitDocument({
      existingUsers: validationResult,
      label,
      threshold,
      shardEnvelopes,
      contacts,
      currentUserId: req.user._id,
      currentDeviceId: req.deviceId || null
    }));

    currentKit.status = 'rotated';
    currentKit.rotatedAt = new Date();
    currentKit.replacedBy = nextKit._id;
    await currentKit.save();

    const populatedNextKit = await RecoveryKit.findById(nextKit._id)
      .populate('trustedContacts.user', 'username avatar');

    res.json({
      message: 'Recovery kit rotated successfully.',
      kit: serializeRecoveryKit(populatedNextKit),
      previousKitId: currentKit._id
    });
  } catch (error) {
    logger.error('Recovery kit rotation error:', error);
    res.status(500).json({ message: 'Failed to rotate the recovery kit.' });
  }
});

router.delete('/kits/:kitId', authenticateToken, requireCsrf, async (req, res) => {
  try {
    const recoveryKit = await RecoveryKit.findOne({
      _id: req.params.kitId,
      user: req.user._id,
      status: { $in: ['active', 'rotated'] }
    });

    if (!recoveryKit) {
      return res.status(404).json({ message: 'Recovery kit not found.' });
    }

    recoveryKit.status = 'revoked';
    recoveryKit.revokedAt = new Date();
    await recoveryKit.save();

    res.json({
      message: 'Recovery kit revoked successfully.',
      kit: serializeRecoveryKit(recoveryKit)
    });
  } catch (error) {
    logger.error('Recovery kit revoke error:', error);
    res.status(500).json({ message: 'Failed to revoke the recovery kit.' });
  }
});

router.get('/received', authenticateToken, async (req, res) => {
  try {
    const kits = await RecoveryKit.find({
      status: 'active',
      'shardEnvelopes.recipientUser': req.user._id
    })
      .populate('user', 'username avatar')
      .select('user label status shardEnvelopes createdAt updatedAt');

    const receivedShares = kits.flatMap((kit) => (
      (kit.shardEnvelopes || [])
        .filter((shard) => shard.recipientUser?.toString() === req.user._id.toString())
        .map((shard) => ({
          kitId: kit._id,
          label: kit.label,
          status: kit.status,
          createdAt: kit.createdAt,
          updatedAt: kit.updatedAt,
          owner: {
            id: kit.user?._id || null,
            username: kit.user?.username || '',
            avatar: kit.user?.avatar || null
          },
          shareIndex: shard.shareIndex,
          recipientFingerprint: shard.recipientFingerprint || null,
          encryptedEnvelope: shard.encryptedEnvelope
        }))
    ));

    res.json({
      receivedShares
    });
  } catch (error) {
    logger.error('Received recovery share list error:', error);
    res.status(500).json({ message: 'Failed to load encrypted recovery shares.' });
  }
});

module.exports = router;
