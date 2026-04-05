export const DEFAULT_DIRECT_SESSION_MAX_SKIP = 64;
export const RECEIVED_COUNTER_WINDOW_LIMIT = 128;

const normalizeCounter = (value, fallback = -1) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const normalizeReceivedCounters = (receivedCounters = []) => (
  [...new Set(
    (Array.isArray(receivedCounters) ? receivedCounters : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0)
  )]
    .sort((left, right) => left - right)
    .slice(-RECEIVED_COUNTER_WINDOW_LIMIT)
);

export const normalizeDirectSessionState = (sessionState = {}) => ({
  ...sessionState,
  version: Number(sessionState?.version || 1),
  protocolVersion: Number(sessionState?.protocolVersion || 3),
  recvCounter: normalizeCounter(sessionState?.recvCounter, -1),
  sendCounter: normalizeCounter(sessionState?.sendCounter, 0),
  maxSkip: Math.max(
    1,
    normalizeCounter(sessionState?.maxSkip, DEFAULT_DIRECT_SESSION_MAX_SKIP)
  ),
  receivedCounters: normalizeReceivedCounters(sessionState?.receivedCounters)
});

export const validateIncomingDirectSessionCounter = (sessionState = {}, targetCounter) => {
  const normalizedState = normalizeDirectSessionState(sessionState);
  const numericTargetCounter = Number(targetCounter);

  if (!Number.isInteger(numericTargetCounter) || numericTargetCounter < 0) {
    return {
      isValid: false,
      error: 'The encrypted session counter is invalid.',
      normalizedState
    };
  }

  if (normalizedState.receivedCounters.includes(numericTargetCounter)) {
    return {
      isValid: false,
      error: 'The encrypted session message was already processed.',
      normalizedState
    };
  }

  if (
    numericTargetCounter > normalizedState.recvCounter
    && (numericTargetCounter - normalizedState.recvCounter) > normalizedState.maxSkip
  ) {
    return {
      isValid: false,
      error: `The encrypted session exceeded the max skip window of ${normalizedState.maxSkip}.`,
      normalizedState
    };
  }

  return {
    isValid: true,
    error: null,
    normalizedState
  };
};

export const registerReceivedDirectSessionCounter = (sessionState = {}, targetCounter) => {
  const normalizedState = normalizeDirectSessionState(sessionState);
  const numericTargetCounter = Number(targetCounter);

  return {
    ...normalizedState,
    recvCounter: Math.max(normalizedState.recvCounter, numericTargetCounter),
    receivedCounters: normalizeReceivedCounters([
      ...normalizedState.receivedCounters,
      numericTargetCounter
    ])
  };
};
