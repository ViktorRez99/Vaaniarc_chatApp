const {
  applyExpiredPrivateMessagePlaceholder,
  redactPrivateMessageForUser
} = require('./messagePrivacy');

const PRIVATE_MESSAGE_SELECT = [
  'content',
  'encryptedContent',
  'protocolVersion',
  'senderDeviceId',
  'tempId',
  'messageType',
  'fileUrl',
  'fileMetadata',
  'createdAt',
  'updatedAt',
  'sender',
  'read',
  'readAt',
  'expiresInSeconds',
  'expiresAt',
  'revocableUntil',
  'isViewOnce',
  'viewOnceConsumedAt',
  'viewedBy',
  'reactions',
  'replyTo',
  'forwardedFrom',
  'isEdited',
  'editedAt',
  'isDeleted',
  'deletedAt',
  'isPinned',
  'pinnedAt',
  'pinnedBy'
].join(' ');

const PRIVATE_MESSAGE_REPLY_SELECT = [
  'content',
  'encryptedContent',
  'protocolVersion',
  'messageType',
  'fileUrl',
  'fileMetadata',
  'revocableUntil',
  'isViewOnce',
  'viewOnceConsumedAt',
  'sender',
  'isEdited',
  'isDeleted',
  'createdAt',
  'forwardedFrom'
].join(' ');

const PRIVATE_MESSAGE_POPULATE = [
  { path: 'sender', select: 'username avatar' },
  {
    path: 'replyTo',
    select: PRIVATE_MESSAGE_REPLY_SELECT,
    populate: [
      {
        path: 'sender',
        select: 'username avatar'
      },
      {
        path: 'forwardedFrom.originalSender',
        select: 'username avatar'
      }
    ]
  },
  {
    path: 'reactions.user',
    select: 'username avatar'
  },
  {
    path: 'pinnedBy',
    select: 'username avatar'
  },
  {
    path: 'forwardedFrom.originalSender',
    select: 'username avatar'
  }
];

const populatePrivateMessage = async (messageOrQuery) => {
  if (!messageOrQuery || typeof messageOrQuery.populate !== 'function') {
    return messageOrQuery;
  }

  return messageOrQuery.populate(PRIVATE_MESSAGE_POPULATE);
};

const serializePrivateMessageForUser = (message, userId) => {
  const serializedMessage = redactPrivateMessageForUser(
    applyExpiredPrivateMessagePlaceholder(message),
    userId
  );

  return serializedMessage?.toObject ? serializedMessage.toObject() : serializedMessage;
};

const serializePrivateMessagesForUser = (messages = [], userId) => (
  messages.map((message) => serializePrivateMessageForUser(message, userId))
);

module.exports = {
  PRIVATE_MESSAGE_SELECT,
  PRIVATE_MESSAGE_POPULATE,
  populatePrivateMessage,
  serializePrivateMessageForUser,
  serializePrivateMessagesForUser
};
