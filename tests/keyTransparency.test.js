const {
  buildTransparencyBundleHash,
  buildTransparencyCheckpoint,
  buildTransparencyEntryHash,
  buildTransparencyLogRoot,
  buildTransparencyPayload,
  verifyTransparencyChain
} = require('../server/utils/keyTransparency');

describe('keyTransparency utilities', () => {
  it('builds a deterministic bundle hash for public device material', () => {
    const bundle = {
      algorithm: 'secretbox+sealed-box+ed25519',
      fingerprint: 'ABCD',
      encryptionPublicKey: 'enc-public',
      signingPublicKey: 'sign-public',
      signedPreKey: {
        id: 'signed-prekey-1',
        publicKey: 'spk-public',
        signature: 'spk-signature'
      },
      oneTimePreKeys: [
        { id: 'otk-1', publicKey: 'otk-public-1' },
        { id: 'otk-2', publicKey: 'otk-public-2' }
      ]
    };

    expect(buildTransparencyBundleHash(bundle, 2)).toBe(buildTransparencyBundleHash(bundle, 2));
  });

  it('verifies a valid append-only transparency chain', () => {
    const firstPayload = buildTransparencyPayload({
      userId: 'user-1',
      deviceId: 'device-a',
      action: 'publish',
      fingerprint: 'fingerprint-a',
      bundleHash: 'bundle-a',
      cryptoProfileHash: 'profile-a',
      coldPathMaterialHash: 'cold-a',
      keyBundleVersion: 2,
      occurredAt: '2026-04-03T00:00:00.000Z'
    });
    const firstHash = buildTransparencyEntryHash({
      previousEntryHash: null,
      payload: firstPayload
    });
    const firstRootHash = buildTransparencyLogRoot({
      previousRootHash: null,
      entryHash: firstHash
    });
    const secondPayload = buildTransparencyPayload({
      userId: 'user-1',
      deviceId: 'device-a',
      action: 'rotate',
      fingerprint: 'fingerprint-b',
      bundleHash: 'bundle-b',
      cryptoProfileHash: 'profile-b',
      coldPathMaterialHash: 'cold-b',
      keyBundleVersion: 2,
      occurredAt: '2026-04-04T00:00:00.000Z'
    });
    const secondHash = buildTransparencyEntryHash({
      previousEntryHash: firstHash,
      payload: secondPayload
    });
    const secondRootHash = buildTransparencyLogRoot({
      previousRootHash: firstRootHash,
      entryHash: secondHash
    });

    expect(verifyTransparencyChain([
      {
        ...firstPayload,
        previousEntryHash: null,
        logIndex: 0,
        logRootHash: firstRootHash,
        entryHash: firstHash
      },
      {
        ...secondPayload,
        previousEntryHash: firstHash,
        logIndex: 1,
        logRootHash: secondRootHash,
        entryHash: secondHash
      }
    ])).toBe(true);
  });

  it('detects a tampered transparency chain', () => {
    const firstPayload = buildTransparencyPayload({
      userId: 'user-2',
      deviceId: 'device-b',
      action: 'publish',
      fingerprint: 'fingerprint-a',
      bundleHash: 'bundle-a',
      cryptoProfileHash: 'profile-a',
      coldPathMaterialHash: 'cold-a',
      keyBundleVersion: 2,
      occurredAt: '2026-04-03T00:00:00.000Z'
    });
    const firstHash = buildTransparencyEntryHash({
      previousEntryHash: null,
      payload: firstPayload
    });

    expect(verifyTransparencyChain([
      {
        ...firstPayload,
        previousEntryHash: 'wrong-root',
        logIndex: 0,
        logRootHash: buildTransparencyLogRoot({
          previousRootHash: null,
          entryHash: firstHash
        }),
        entryHash: firstHash
      }
    ])).toBe(false);
  });

  it('builds a verifiable checkpoint for the transparency log', () => {
    const payload = buildTransparencyPayload({
      userId: 'user-3',
      deviceId: 'device-c',
      action: 'publish',
      fingerprint: 'fingerprint-c',
      bundleHash: 'bundle-c',
      cryptoProfileHash: 'profile-c',
      coldPathMaterialHash: 'cold-c',
      keyBundleVersion: 2,
      occurredAt: '2026-04-05T00:00:00.000Z'
    });
    const entryHash = buildTransparencyEntryHash({
      previousEntryHash: null,
      payload
    });
    const logRootHash = buildTransparencyLogRoot({
      previousRootHash: null,
      entryHash
    });

    expect(buildTransparencyCheckpoint([
      {
        ...payload,
        previousEntryHash: null,
        logIndex: 0,
        logRootHash,
        entryHash
      }
    ])).toMatchObject({
      verified: true,
      head: entryHash,
      rootHash: logRootHash,
      treeSize: 1
    });
  });
});
