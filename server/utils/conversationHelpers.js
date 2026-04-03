const VALID_CONVERSATION_TYPES = ['direct', 'group', 'channel'];

const buildConversationId = (type, sourceId) => {
  if (!VALID_CONVERSATION_TYPES.includes(type)) {
    throw new Error('Invalid conversation type');
  }

  if (!sourceId) {
    throw new Error('Conversation source id is required');
  }

  return `${type}_${sourceId}`;
};

const parseConversationId = (conversationId) => {
  if (!conversationId || typeof conversationId !== 'string') {
    return null;
  }

  const separatorIndex = conversationId.indexOf('_');

  if (separatorIndex <= 0) {
    return null;
  }

  const type = conversationId.slice(0, separatorIndex);
  const sourceId = conversationId.slice(separatorIndex + 1);

  if (!VALID_CONVERSATION_TYPES.includes(type) || !sourceId) {
    return null;
  }

  return {
    type,
    sourceId
  };
};

module.exports = {
  VALID_CONVERSATION_TYPES,
  buildConversationId,
  parseConversationId
};
