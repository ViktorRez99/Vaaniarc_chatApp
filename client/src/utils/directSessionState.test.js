import {
  DEFAULT_DIRECT_SESSION_MAX_SKIP,
  normalizeDirectSessionState,
  registerReceivedDirectSessionCounter,
  validateIncomingDirectSessionCounter
} from './directSessionState';

describe('directSessionState', () => {
  it('normalizes legacy session state with defaults', () => {
    expect(normalizeDirectSessionState({
      recvCounter: undefined,
      sendCounter: undefined
    })).toMatchObject({
      protocolVersion: 3,
      recvCounter: -1,
      sendCounter: 0,
      maxSkip: DEFAULT_DIRECT_SESSION_MAX_SKIP,
      receivedCounters: []
    });
  });

  it('rejects duplicate counters as replayed envelopes', () => {
    const validation = validateIncomingDirectSessionCounter({
      recvCounter: 5,
      receivedCounters: [2, 5]
    }, 5);

    expect(validation).toMatchObject({
      isValid: false,
      error: expect.stringMatching(/already processed/i)
    });
  });

  it('rejects envelopes that exceed the configured skip window', () => {
    const validation = validateIncomingDirectSessionCounter({
      recvCounter: 4,
      maxSkip: 8
    }, 20);

    expect(validation).toMatchObject({
      isValid: false,
      error: expect.stringMatching(/max skip window/i)
    });
  });

  it('tracks received counters in a bounded window', () => {
    const nextState = registerReceivedDirectSessionCounter({
      recvCounter: 1,
      receivedCounters: [0, 1]
    }, 4);

    expect(nextState.recvCounter).toBe(4);
    expect(nextState.receivedCounters).toEqual([0, 1, 4]);
  });
});
