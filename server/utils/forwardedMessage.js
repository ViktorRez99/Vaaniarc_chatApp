const normalizeString = (value, maxLength = 120) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
};

const normalizeForwardedFrom = (payload = null) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const sourceType = ['chat', 'room'].includes(payload.sourceType) ? payload.sourceType : 'chat';
  const originalMessageId = payload.originalMessageId || null;
  const originalSender = payload.originalSender || null;
  const originalSenderName = normalizeString(payload.originalSenderName, 80);
  const sourceId = payload.sourceId || null;

  if (!originalMessageId && !originalSender && !originalSenderName && !sourceId) {
    return null;
  }

  return {
    originalMessageId,
    originalSender,
    originalSenderName,
    sourceType,
    sourceId
  };
};

module.exports = {
  normalizeForwardedFrom
};
