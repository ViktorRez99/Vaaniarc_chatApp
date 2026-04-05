const crypto = require('crypto');
const { stableStringify } = require('./keyTransparency');

const DEFAULT_CRYPTO_PROFILE = {
  version: 1,
  initialAgreement: {
    implemented: ['curve25519-prekey', 'ml-kem-1024'],
    planned: [],
    targetMode: 'dual-hybrid'
  },
  ratchet: {
    implemented: 'sealed-box-per-message-v4',
    maxSkip: 64
  },
  signatures: {
    implemented: ['ed25519', 'ml-dsa-87'],
    planned: []
  },
  transparency: {
    mode: 'append-only-log-root-v2'
  },
  storage: {
    client: 'indexeddb-aes-gcm-wrapped'
  }
};

const sha256Hex = (value) => crypto
  .createHash('sha256')
  .update(String(value || ''))
  .digest('hex');

const mergeNested = (baseValue = {}, overrideValue = {}) => ({
  ...baseValue,
  ...(overrideValue && typeof overrideValue === 'object' ? overrideValue : {})
});

const normalizeCryptoProfile = (profile = {}) => ({
  version: Number(profile?.version || DEFAULT_CRYPTO_PROFILE.version),
  initialAgreement: mergeNested(
    DEFAULT_CRYPTO_PROFILE.initialAgreement,
    profile?.initialAgreement
  ),
  ratchet: {
    ...mergeNested(DEFAULT_CRYPTO_PROFILE.ratchet, profile?.ratchet),
    maxSkip: Number(profile?.ratchet?.maxSkip || DEFAULT_CRYPTO_PROFILE.ratchet.maxSkip)
  },
  signatures: mergeNested(
    DEFAULT_CRYPTO_PROFILE.signatures,
    profile?.signatures
  ),
  transparency: mergeNested(
    DEFAULT_CRYPTO_PROFILE.transparency,
    profile?.transparency
  ),
  storage: mergeNested(
    DEFAULT_CRYPTO_PROFILE.storage,
    profile?.storage
  )
});

const extractColdPathKeyMaterial = (keyBundle = {}) => {
  const coldPathMaterial = {
    hybridBundles: keyBundle?.hybridBundles || null,
    announcedAlgorithms: keyBundle?.announcedAlgorithms || null,
    auxiliaryBundles: keyBundle?.auxiliaryBundles || null
  };

  return Object.values(coldPathMaterial).some(Boolean)
    ? coldPathMaterial
    : null;
};

const stripColdPathKeyMaterial = (keyBundle = {}) => {
  const {
    hybridBundles,
    announcedAlgorithms,
    auxiliaryBundles,
    cryptoProfile,
    ...hotBundle
  } = keyBundle || {};

  return hotBundle;
};

const mergeHotAndColdKeyBundle = (hotBundle = {}, coldPathMaterial = null) => {
  if (!coldPathMaterial) {
    return hotBundle;
  }

  return {
    ...hotBundle,
    ...Object.fromEntries(
      Object.entries(coldPathMaterial).filter(([, value]) => value != null)
    )
  };
};

const buildStableColdPathMaterial = (coldPathMaterial = null) => {
  if (!coldPathMaterial || typeof coldPathMaterial !== 'object') {
    return coldPathMaterial;
  }

  const serializedMaterial = JSON.parse(JSON.stringify(coldPathMaterial));
  const postQuantumKem = serializedMaterial?.auxiliaryBundles?.postQuantum?.kem;

  if (postQuantumKem && Array.isArray(postQuantumKem.oneTimePreKeys)) {
    postQuantumKem.oneTimePreKeys = [];
  }

  return serializedMaterial;
};

const buildColdPathMaterialHash = (coldPathMaterial = null) => (
  coldPathMaterial
    ? sha256Hex(stableStringify(buildStableColdPathMaterial(coldPathMaterial)))
    : null
);

const buildCryptoProfileHash = (profile = {}) => sha256Hex(
  stableStringify(normalizeCryptoProfile(profile))
);

module.exports = {
  DEFAULT_CRYPTO_PROFILE,
  normalizeCryptoProfile,
  extractColdPathKeyMaterial,
  stripColdPathKeyMaterial,
  mergeHotAndColdKeyBundle,
  buildStableColdPathMaterial,
  buildColdPathMaterialHash,
  buildCryptoProfileHash
};
