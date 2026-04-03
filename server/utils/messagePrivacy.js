const { normalizeId } = require('./idHelpers');

const MIN_DISAPPEARING_SECONDS = 60;
const MAX_DISAPPEARING_SECONDS = 30 * 24 * 60 * 60;
const VIEW_ONCE_PLACEHOLDER = 'View-once attachment already opened';
const EXPIRED_PLACEHOLDER = 'Disappearing message expired';

const normalizeDisappearingSeconds = (value) => {
  if (value === null || value === undefined || value === '' || value === false) {
    return null;
  }

  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isFinite(parsedValue)) {
    throw new Error('Disappearing timer must be a number of seconds.');
  }

  if (parsedValue < MIN_DISAPPEARING_SECONDS || parsedValue > MAX_DISAPPEARING_SECONDS) {
    throw new Error(`Disappearing timer must be between ${MIN_DISAPPEARING_SECONDS} seconds and ${MAX_DISAPPEARING_SECONDS} seconds.`);
  }

  return parsedValue;
};

const normalizeViewOnce = (value) => value === true || value === 'true' || value === 1 || value === '1';

const sanitizePrivacyInput = ({ expiresInSeconds = null, isViewOnce = false } = {}) => ({
  expiresInSeconds: normalizeDisappearingSeconds(expiresInSeconds),
  isViewOnce: normalizeViewOnce(isViewOnce)
});

const buildPrivacyFields = (input = {}, baseDate = new Date()) => {
  const { expiresInSeconds, isViewOnce } = sanitizePrivacyInput(input);

  return {
    expiresInSeconds,
    expiresAt: expiresInSeconds ? new Date(baseDate.getTime() + (expiresInSeconds * 1000)) : null,
    isViewOnce
  };
};

const buildActiveMessageQuery = (baseQuery = {}, now = new Date()) => ({
  $and: [
    baseQuery,
    {
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } }
      ]
    }
  ]
});

const isMessageExpired = (message, now = new Date()) => {
  if (!message?.expiresAt) {
    return false;
  }

  return new Date(message.expiresAt).getTime() <= now.getTime();
};

const isViewOnceContentConsumed = (message) => Boolean(message?.isViewOnce && message?.viewOnceConsumedAt);

const hasUserConsumedViewOnce = (message, userId) => {
  if (!message?.isViewOnce || !userId) {
    return false;
  }

  const senderId = normalizeId(message.sender?._id || message.sender);
  const normalizedUserId = normalizeId(userId);

  if (!normalizedUserId || senderId === normalizedUserId) {
    return false;
  }

  return Array.isArray(message.viewedBy) && message.viewedBy.some(
    (entry) => normalizeId(entry.user?._id || entry.user) === normalizedUserId
  );
};

const clearViewOncePayload = (message) => {
  if (!message) {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(message, 'fileUrl')) {
    message.fileUrl = null;
  }

  if (Object.prototype.hasOwnProperty.call(message, 'fileMetadata')) {
    message.fileMetadata = null;
  }

  if (Object.prototype.hasOwnProperty.call(message, 'encryptedContent')) {
    message.encryptedContent = null;
  }

  if (message.content && typeof message.content === 'object' && !Array.isArray(message.content)) {
    message.content = {
      ...(message.content || {}),
      text: VIEW_ONCE_PLACEHOLDER,
      file: null
    };
    return;
  }

  message.content = VIEW_ONCE_PLACEHOLDER;
};

const markViewOnceConsumed = (message, userId) => {
  if (!message?.isViewOnce || !userId) {
    return false;
  }

  const senderId = normalizeId(message.sender?._id || message.sender);
  const normalizedUserId = normalizeId(userId);

  if (!normalizedUserId || senderId === normalizedUserId) {
    return false;
  }

  if (isViewOnceContentConsumed(message)) {
    return false;
  }

  if (!Array.isArray(message.viewedBy)) {
    message.viewedBy = [];
  }

  const existingEntry = message.viewedBy.find(
    (entry) => normalizeId(entry.user?._id || entry.user) === normalizedUserId
  );

  if (existingEntry) {
    return false;
  }

  message.viewedBy.push({
    user: userId,
    viewedAt: new Date()
  });
  message.viewOnceConsumedAt = new Date();
  clearViewOncePayload(message);

  return true;
};

const redactPrivateMessageForUser = (message, userId) => {
  if (!isViewOnceContentConsumed(message) && !hasUserConsumedViewOnce(message, userId)) {
    return message;
  }

  const nextMessage = message.toObject ? message.toObject() : { ...message };
  nextMessage.fileUrl = null;
  nextMessage.fileMetadata = null;
  nextMessage.content = VIEW_ONCE_PLACEHOLDER;
  nextMessage.isViewOnceConsumed = true;
  return nextMessage;
};

const redactRoomMessageForUser = (message, userId) => {
  if (!isViewOnceContentConsumed(message) && !hasUserConsumedViewOnce(message, userId)) {
    return message;
  }

  const nextMessage = message.toObject ? message.toObject() : { ...message };
  nextMessage.content = {
    ...(nextMessage.content || {}),
    text: VIEW_ONCE_PLACEHOLDER,
    file: null
  };
  nextMessage.isViewOnceConsumed = true;
  return nextMessage;
};

const applyExpiredPrivateMessagePlaceholder = (message, now = new Date()) => {
  if (!isMessageExpired(message, now)) {
    return message;
  }

  const nextMessage = message.toObject ? message.toObject() : { ...message };
  nextMessage.content = EXPIRED_PLACEHOLDER;
  nextMessage.fileUrl = null;
  nextMessage.fileMetadata = null;
  nextMessage.isExpired = true;
  return nextMessage;
};

module.exports = {
  EXPIRED_PLACEHOLDER,
  VIEW_ONCE_PLACEHOLDER,
  buildActiveMessageQuery,
  buildPrivacyFields,
  hasUserConsumedViewOnce,
  isViewOnceContentConsumed,
  isMessageExpired,
  markViewOnceConsumed,
  redactPrivateMessageForUser,
  redactRoomMessageForUser,
  applyExpiredPrivateMessagePlaceholder,
  sanitizePrivacyInput
};
