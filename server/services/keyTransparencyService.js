const KeyTransparencyEntry = require('../models/KeyTransparencyEntry');
const {
  buildTransparencyBundleHash,
  buildTransparencyEntryHash,
  buildTransparencyPayload,
  verifyTransparencyChain
} = require('../utils/keyTransparency');

const normalizeFingerprint = (keyBundle = {}, fallbackFingerprint = null) => keyBundle?.fingerprint || fallbackFingerprint || null;

const appendTransparencyEntry = async ({
  userId,
  deviceId,
  action,
  keyBundle = {},
  keyBundleVersion = 2,
  fingerprint = null,
  occurredAt = new Date()
}) => {
  const latestEntry = await KeyTransparencyEntry.findOne({ user: userId })
    .sort({ occurredAt: -1, createdAt: -1 })
    .select('entryHash');
  const payload = buildTransparencyPayload({
    userId,
    deviceId,
    action,
    fingerprint: normalizeFingerprint(keyBundle, fingerprint),
    bundleHash: action === 'revoke'
      ? null
      : buildTransparencyBundleHash(keyBundle, keyBundleVersion),
    keyBundleVersion,
    occurredAt
  });

  const entry = await KeyTransparencyEntry.create({
    user: userId,
    deviceId,
    action,
    fingerprint: payload.fingerprint,
    bundleHash: payload.bundleHash,
    keyBundleVersion: payload.keyBundleVersion,
    previousEntryHash: latestEntry?.entryHash || null,
    entryHash: buildTransparencyEntryHash({
      previousEntryHash: latestEntry?.entryHash || null,
      payload
    }),
    occurredAt: payload.occurredAt
  });

  return entry;
};

const getTransparencyLogForUser = async (userId) => {
  const entries = await KeyTransparencyEntry.find({ user: userId })
    .sort({ occurredAt: 1, createdAt: 1 })
    .lean();

  const serializedEntries = entries.map((entry) => ({
    deviceId: entry.deviceId,
    action: entry.action,
    fingerprint: entry.fingerprint,
    bundleHash: entry.bundleHash,
    keyBundleVersion: entry.keyBundleVersion,
    previousEntryHash: entry.previousEntryHash,
    entryHash: entry.entryHash,
    occurredAt: entry.occurredAt
  }));

  return {
    verified: verifyTransparencyChain(serializedEntries),
    head: serializedEntries[serializedEntries.length - 1]?.entryHash || null,
    entries: serializedEntries
  };
};

module.exports = {
  appendTransparencyEntry,
  getTransparencyLogForUser
};
