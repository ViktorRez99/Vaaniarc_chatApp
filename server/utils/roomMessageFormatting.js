const {
  redactRoomMessageForUser
} = require('./messagePrivacy');

const ROOM_MESSAGE_SELECT = [
  'content',
  'encryptedContent',
  'protocolVersion',
  'senderDeviceId',
  'tempId',
  'messageType',
  'createdAt',
  'updatedAt',
  'sender',
  'room',
  'replyTo',
  'expiresInSeconds',
  'expiresAt',
  'revocableUntil',
  'isViewOnce',
  'viewOnceConsumedAt',
  'viewedBy',
  'reactions',
  'isEdited',
  'editedAt',
  'isDeleted',
  'deletedAt',
  'isPinned',
  'pinnedAt',
  'pinnedBy',
  'forwardedFrom'
].join(' ');

const ROOM_MESSAGE_REPLY_SELECT = [
  'content',
  'encryptedContent',
  'protocolVersion',
  'messageType',
  'sender',
  'isEdited',
  'isDeleted',
  'createdAt',
  'forwardedFrom'
].join(' ');

const ROOM_MESSAGE_POPULATE = [
  { path: 'sender', select: 'username avatar' },
  {
    path: 'replyTo',
    select: ROOM_MESSAGE_REPLY_SELECT,
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

const populateRoomMessage = async (messageOrQuery) => {
  if (!messageOrQuery || typeof messageOrQuery.populate !== 'function') {
    return messageOrQuery;
  }

  return messageOrQuery.populate(ROOM_MESSAGE_POPULATE);
};

const serializeRoomMessageForUser = (message, userId) => {
  const serializedMessage = redactRoomMessageForUser(message, userId);
  return serializedMessage?.toObject ? serializedMessage.toObject() : serializedMessage;
};

const serializeRoomMessagesForUser = (messages = [], userId) => (
  messages.map((message) => serializeRoomMessageForUser(message, userId))
);

module.exports = {
  ROOM_MESSAGE_SELECT,
  ROOM_MESSAGE_POPULATE,
  populateRoomMessage,
  serializeRoomMessageForUser,
  serializeRoomMessagesForUser
};
