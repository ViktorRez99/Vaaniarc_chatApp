const {
  parseEncryptedPayload,
  getProtocolVersion,
  getSenderDeviceId,
  getEnvelopeDeviceIds,
  getPayloadMetadata,
  validateDeviceBoundPayload
} = require('../server/utils/e2eePayloads');

describe('e2eePayloads', () => {
  it('parses valid JSON payloads and returns null for invalid input', () => {
    expect(parseEncryptedPayload('{"version":2,"senderDeviceId":"device-1"}')).toEqual({
      version: 2,
      senderDeviceId: 'device-1'
    });

    expect(parseEncryptedPayload('not-json')).toBeNull();
    expect(parseEncryptedPayload(null)).toBeNull();
  });

  it('extracts protocol version and sender device id from encrypted payloads', () => {
    const payload = JSON.stringify({
      version: 2,
      protocolVersion: 2,
      senderDeviceId: 'device-99',
      envelopes: [
        { deviceId: 'device-99', wrappedKey: 'a' },
        { deviceId: 'device-42', wrappedKey: 'b' }
      ]
    });

    expect(getProtocolVersion(payload)).toBe(2);
    expect(getSenderDeviceId(payload)).toBe('device-99');
    expect(getEnvelopeDeviceIds(payload)).toEqual(['device-99', 'device-42']);
  });

  it('defaults malformed payload metadata to v1 with no sender device', () => {
    expect(getPayloadMetadata({ encryptedContent: 'bad-json' })).toEqual({
      protocolVersion: 1,
      senderDeviceId: null,
      targetDeviceIds: []
    });

    expect(getPayloadMetadata({ encryptionPayload: JSON.stringify({}) })).toEqual({
      protocolVersion: 1,
      senderDeviceId: null,
      targetDeviceIds: []
    });
  });

  it('validates v2 payloads against the authenticated device id', () => {
    const validPayload = JSON.stringify({
      version: 2,
      senderDeviceId: 'device-1',
      envelopes: [
        { deviceId: 'device-1', wrappedKey: 'a' },
        { deviceId: 'device-2', wrappedKey: 'b' }
      ]
    });

    expect(validateDeviceBoundPayload({
      encryptedContent: validPayload,
      authenticatedDeviceId: 'device-1',
      requireSelfEnvelope: true
    })).toMatchObject({
      isValid: true,
      protocolVersion: 2,
      senderDeviceId: 'device-1',
      targetDeviceIds: ['device-1', 'device-2']
    });

    expect(validateDeviceBoundPayload({
      encryptedContent: validPayload,
      authenticatedDeviceId: 'device-9',
      requireSelfEnvelope: true
    })).toMatchObject({
      isValid: false
    });

    expect(validateDeviceBoundPayload({
      encryptedContent: JSON.stringify({
        version: 2,
        senderDeviceId: 'device-1',
        envelopes: [{ deviceId: 'device-2', wrappedKey: 'b' }]
      }),
      authenticatedDeviceId: 'device-1',
      requireSelfEnvelope: true
    })).toMatchObject({
      isValid: false
    });
  });

  it('rejects malformed or legacy encrypted payloads', () => {
    expect(validateDeviceBoundPayload({
      encryptedContent: 'not-json',
      authenticatedDeviceId: 'device-1',
      requireSelfEnvelope: true
    })).toMatchObject({
      isValid: false,
      error: expect.stringMatching(/protocol version 2 or newer/i)
    });

    expect(validateDeviceBoundPayload({
      encryptedContent: JSON.stringify({
        version: 1,
        senderDeviceId: 'device-1'
      }),
      authenticatedDeviceId: 'device-1',
      requireSelfEnvelope: true
    })).toMatchObject({
      isValid: false,
      error: expect.stringMatching(/protocol version 2 or newer/i)
    });
  });

  it('requires ratchet metadata for direct-session v4 payloads', () => {
    expect(validateDeviceBoundPayload({
      encryptedContent: JSON.stringify({
        version: 4,
        senderDeviceId: 'device-1',
        envelopes: [
          {
            deviceId: 'device-1',
            mode: 'session',
            counter: 0,
            nonce: 'nonce',
            ciphertext: 'ciphertext'
          }
        ]
      }),
      authenticatedDeviceId: 'device-1',
      requireSelfEnvelope: true
    })).toMatchObject({
      isValid: false,
      error: expect.stringMatching(/ratchet metadata/i)
    });

    expect(validateDeviceBoundPayload({
      encryptedContent: JSON.stringify({
        version: 4,
        senderDeviceId: 'device-1',
        envelopes: [
          {
            deviceId: 'device-1',
            mode: 'session',
            counter: 0,
            nonce: 'nonce',
            ciphertext: 'ciphertext',
            ratchet: {
              ciphertext: 'wrapped-secret',
              commitment: 'commitment'
            }
          }
        ]
      }),
      authenticatedDeviceId: 'device-1',
      requireSelfEnvelope: true
    })).toMatchObject({
      isValid: true
    });
  });
});
