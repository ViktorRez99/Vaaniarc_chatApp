const {
  DEFAULT_CRYPTO_PROFILE,
  buildColdPathMaterialHash,
  buildCryptoProfileHash,
  extractColdPathKeyMaterial,
  mergeHotAndColdKeyBundle,
  normalizeCryptoProfile,
  stripColdPathKeyMaterial
} = require('../server/utils/cryptoProfile');

describe('cryptoProfile utilities', () => {
  it('normalizes a crypto profile with safe defaults', () => {
    expect(normalizeCryptoProfile()).toEqual(DEFAULT_CRYPTO_PROFILE);
  });

  it('separates cold-path key material from the hot bundle', () => {
    const keyBundle = {
      algorithm: 'secretbox+sealed-box+ed25519',
      fingerprint: 'fingerprint',
      encryptionPublicKey: 'enc',
      hybridBundles: {
        announcedAlgorithms: ['ml-kem-1024']
      }
    };

    const coldPathMaterial = extractColdPathKeyMaterial(keyBundle);
    const hotBundle = stripColdPathKeyMaterial(keyBundle);

    expect(coldPathMaterial).toMatchObject({
      hybridBundles: {
        announcedAlgorithms: ['ml-kem-1024']
      }
    });
    expect(hotBundle).toMatchObject({
      algorithm: 'secretbox+sealed-box+ed25519',
      encryptionPublicKey: 'enc'
    });
    expect(mergeHotAndColdKeyBundle(hotBundle, coldPathMaterial)).toMatchObject({
      algorithm: 'secretbox+sealed-box+ed25519',
      hybridBundles: {
        announcedAlgorithms: ['ml-kem-1024']
      }
    });
  });

  it('builds deterministic hashes for cold-path material and profiles', () => {
    const material = {
      hybridBundles: {
        announcedAlgorithms: ['ml-kem-1024']
      }
    };
    const profile = normalizeCryptoProfile({
      ratchet: { maxSkip: 96 }
    });

    expect(buildColdPathMaterialHash(material)).toBe(buildColdPathMaterialHash(material));
    expect(buildCryptoProfileHash(profile)).toBe(buildCryptoProfileHash(profile));
  });

  it('ignores post-quantum one-time prekeys when hashing stable cold-path material', () => {
    const materialA = {
      auxiliaryBundles: {
        postQuantum: {
          signatures: {
            algorithm: 'ml-dsa-87',
            publicKey: 'pq-signing-public'
          },
          kem: {
            algorithm: 'ml-kem-1024',
            signedPreKey: {
              id: 'pq-spk',
              publicKey: 'pq-signed-prekey'
            },
            oneTimePreKeys: [
              { id: 'pq-1', publicKey: 'first' }
            ]
          }
        }
      }
    };
    const materialB = {
      auxiliaryBundles: {
        postQuantum: {
          signatures: {
            algorithm: 'ml-dsa-87',
            publicKey: 'pq-signing-public'
          },
          kem: {
            algorithm: 'ml-kem-1024',
            signedPreKey: {
              id: 'pq-spk',
              publicKey: 'pq-signed-prekey'
            },
            oneTimePreKeys: [
              { id: 'pq-9', publicKey: 'different' }
            ]
          }
        }
      }
    };

    expect(buildColdPathMaterialHash(materialA)).toBe(buildColdPathMaterialHash(materialB));
  });
});
