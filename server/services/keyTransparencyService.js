const KeyTransparencyEntry = require('../models/KeyTransparencyEntry');
const {
  buildTransparencyBundleHash,
  buildTransparencyCheckpoint,
  buildTransparencyEntryHash,
  buildTransparencyLogRoot,
  buildTransparencyPayload,
  verifyTransparencyChain
} = require('../utils/keyTransparency');
const {
  buildColdPathMaterialHash,
  buildCryptoProfileHash
} = require('../utils/cryptoProfile');

const normalizeFingerprint = (keyBundle = {}, fallbackFingerprint = null) => keyBundle?.fingerprint || fallbackFingerprint || null;

const appendTransparencyEntry = async ({
  userId,
  deviceId,
  action,
  keyBundle = {},
  keyBundleVersion = 2,
  cryptoProfile = {},
  coldPathMaterial = null,
  fingerprint = null,
  occurredAt = new Date()
}) => {
  const latestEntry = await KeyTransparencyEntry.findOne({ user: userId })
    .sort({ occurredAt: -1, createdAt: -1 })
    .select('entryHash logIndex logRootHash');
  const legacyCheckpoint = (!latestEntry || (latestEntry.logIndex != null && latestEntry.logRootHash))
    ? null
    : buildTransparencyCheckpoint(
      (await KeyTransparencyEntry.find({ user: userId })
        .sort({ occurredAt: 1, createdAt: 1 })
        .lean())
        .map((entry) => ({
          deviceId: entry.deviceId,
          action: entry.action,
          fingerprint: entry.fingerprint,
          bundleHash: entry.bundleHash,
          keyBundleVersion: entry.keyBundleVersion,
          cryptoProfileHash: entry.cryptoProfileHash,
          coldPathMaterialHash: entry.coldPathMaterialHash,
          previousEntryHash: entry.previousEntryHash,
          logIndex: entry.logIndex,
          logRootHash: entry.logRootHash,
          entryHash: entry.entryHash,
          occurredAt: entry.occurredAt
        }))
    );
  const payload = buildTransparencyPayload({
    userId,
    deviceId,
    action,
    fingerprint: normalizeFingerprint(keyBundle, fingerprint),
    bundleHash: action === 'revoke'
      ? null
      : buildTransparencyBundleHash(keyBundle, keyBundleVersion),
    cryptoProfileHash: buildCryptoProfileHash(cryptoProfile),
    coldPathMaterialHash: action === 'revoke'
      ? null
      : buildColdPathMaterialHash(coldPathMaterial),
    keyBundleVersion,
    occurredAt
  });
  const previousEntryHash = latestEntry?.entryHash || null;
  const entryHash = buildTransparencyEntryHash({
    previousEntryHash,
    payload
  });
  const logIndex = Number(
    latestEntry?.logIndex
      ?? ((legacyCheckpoint?.treeSize || 0) - 1)
  ) + 1;
  const logRootHash = buildTransparencyLogRoot({
    previousRootHash: latestEntry?.logRootHash || legacyCheckpoint?.rootHash || null,
    entryHash
  });

  const entry = await KeyTransparencyEntry.create({
    user: userId,
    deviceId,
    action,
    fingerprint: payload.fingerprint,
    bundleHash: payload.bundleHash,
    keyBundleVersion: payload.keyBundleVersion,
    cryptoProfileHash: payload.cryptoProfileHash,
    coldPathMaterialHash: payload.coldPathMaterialHash,
    previousEntryHash,
    logIndex,
    logRootHash,
    entryHash,
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
    cryptoProfileHash: entry.cryptoProfileHash,
    coldPathMaterialHash: entry.coldPathMaterialHash,
    previousEntryHash: entry.previousEntryHash,
    logIndex: entry.logIndex,
    logRootHash: entry.logRootHash,
    entryHash: entry.entryHash,
    occurredAt: entry.occurredAt
  }));
  const checkpoint = buildTransparencyCheckpoint(serializedEntries);

  return {
    verified: verifyTransparencyChain(serializedEntries),
    head: checkpoint.head || null,
    rootHash: checkpoint.rootHash || null,
    treeSize: checkpoint.treeSize || 0,
    entries: serializedEntries
  };
};

module.exports = {
  appendTransparencyEntry,
  getTransparencyLogForUser
};
