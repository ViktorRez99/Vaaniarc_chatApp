const assertExpectedUpdatedAt = (document, expectedUpdatedAt) => {
  if (!expectedUpdatedAt) {
    return;
  }

  const expectedTimestamp = new Date(expectedUpdatedAt).getTime();
  if (!Number.isFinite(expectedTimestamp)) {
    const error = new Error('expectedUpdatedAt must be a valid ISO timestamp.');
    error.statusCode = 400;
    throw error;
  }

  const currentTimestamp = new Date(document?.updatedAt || document?.createdAt || 0).getTime();
  if (currentTimestamp !== expectedTimestamp) {
    const error = new Error('This message changed on another client. Refresh and try again.');
    error.statusCode = 409;
    throw error;
  }
};

module.exports = {
  assertExpectedUpdatedAt
};
