const crypto = require('crypto');

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
};

const sha256Hex = (value) => crypto
  .createHash('sha256')
  .update(String(value || ''))
  .digest('hex');

const buildTransparencyBundleHash = (keyBundle = {}, keyBundleVersion = 2) => sha256Hex(stableStringify({
  version: Number(keyBundleVersion || 2),
  algorithm: keyBundle.algorithm || null,
  fingerprint: keyBundle.fingerprint || null,
  encryptionPublicKey: keyBundle.encryptionPublicKey || null,
  signingPublicKey: keyBundle.signingPublicKey || null,
  signedPreKey: keyBundle.signedPreKey
    ? {
        id: keyBundle.signedPreKey.id || null,
        publicKey: keyBundle.signedPreKey.publicKey || null,
        signature: keyBundle.signedPreKey.signature || null,
        pqSignature: keyBundle.signedPreKey.pqSignature || null
      }
    : null,
  oneTimePreKeys: Array.isArray(keyBundle.oneTimePreKeys)
    ? keyBundle.oneTimePreKeys.map((preKey) => ({
        id: preKey.id || null,
        publicKey: preKey.publicKey || null
      }))
    : []
}));

const buildTransparencyPayload = ({
  userId,
  deviceId,
  action,
  fingerprint,
  bundleHash,
  cryptoProfileHash = null,
  coldPathMaterialHash = null,
  keyBundleVersion,
  occurredAt
}) => ({
  userId: String(userId || ''),
  deviceId: String(deviceId || ''),
  action: String(action || ''),
  fingerprint: fingerprint || null,
  bundleHash: bundleHash || null,
  cryptoProfileHash: cryptoProfileHash || null,
  coldPathMaterialHash: coldPathMaterialHash || null,
  keyBundleVersion: Number(keyBundleVersion || 2),
  occurredAt: new Date(occurredAt || new Date()).toISOString()
});

const buildTransparencyEntryHash = ({ previousEntryHash = null, payload }) => sha256Hex(
  `${previousEntryHash || 'root'}:${stableStringify(payload)}`
);

const buildTransparencyLogRoot = ({ previousRootHash = null, entryHash = null }) => sha256Hex(
  `${previousRootHash || 'root'}:${entryHash || ''}`
);

const buildTransparencyCheckpoint = (entries = []) => {
  let previousEntryHash = null;
  let previousRootHash = null;
  let verified = true;

  entries.forEach((entry, index) => {
    if (!verified) {
      return;
    }

    const payload = buildTransparencyPayload(entry);
    const expectedHash = buildTransparencyEntryHash({
      previousEntryHash,
      payload
    });
    const expectedRootHash = buildTransparencyLogRoot({
      previousRootHash,
      entryHash: expectedHash
    });

    const hasLegacyCheckpoint = entry.logIndex == null || !entry.logRootHash;

    if (
      entry.previousEntryHash !== previousEntryHash
      || entry.entryHash !== expectedHash
      || (!hasLegacyCheckpoint && Number(entry.logIndex) !== index)
      || (!hasLegacyCheckpoint && entry.logRootHash !== expectedRootHash)
    ) {
      verified = false;
      return;
    }

    previousEntryHash = expectedHash;
    previousRootHash = hasLegacyCheckpoint ? expectedRootHash : entry.logRootHash;
  });

  return {
    verified,
    head: previousEntryHash,
    rootHash: previousRootHash,
    treeSize: entries.length
  };
};

const verifyTransparencyChain = (entries = []) => {
  return buildTransparencyCheckpoint(entries).verified;
};

module.exports = {
  buildTransparencyBundleHash,
  buildTransparencyEntryHash,
  buildTransparencyLogRoot,
  buildTransparencyCheckpoint,
  buildTransparencyPayload,
  stableStringify,
  verifyTransparencyChain
};
