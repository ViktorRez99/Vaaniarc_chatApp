import { normalizeId } from './identity';

export const isAttachmentMessage = (message) => Boolean(
  message?.fileMetadata
  || message?.decryptedFileMetadata
  || message?.fileUrl
  || message?.content?.file
);

export const getMessageTextContent = (message) => {
  if (typeof message?.content === 'string') {
    return message.content.trim();
  }

  if (typeof message?.content?.text === 'string') {
    return message.content.text.trim();
  }

  if (typeof message?.decryptedContent === 'string') {
    return message.decryptedContent.trim();
  }

  return '';
};

export const getMessageSenderName = (message) => {
  const sender = message?.sender;
  if (sender) {
    const fullName = [sender.firstName, sender.lastName].filter(Boolean).join(' ');
    if (fullName) return fullName;
    if (sender.username) return sender.username;
  }
  return message?.forwardedFrom?.originalSenderName
    || message?.forwardedFrom?.originalSender?.username
    || 'Unknown sender';
};

export const getForwardPreviewText = (message) => {
  const textContent = getMessageTextContent(message);
  if (textContent) {
    return textContent;
  }

  if (isAttachmentMessage(message)) {
    return 'Attachment forwarding is not available yet.';
  }

  return 'Message preview unavailable.';
};

export const isForwardablePlaintextMessage = (message) => (
  !message?.isDeleted
  && !isAttachmentMessage(message)
  && Boolean(getMessageTextContent(message))
);

export const buildForwardedFromPayload = (message, sourceType, sourceId) => ({
  originalMessageId: normalizeId(message?._id),
  originalSender: normalizeId(message?.sender?._id || message?.sender),
  originalSenderName: getMessageSenderName(message),
  sourceType,
  sourceId: normalizeId(sourceId)
});

export const sortPinnedMessages = (messages = []) => [...messages].sort((left, right) => {
  const leftPinnedAt = new Date(left?.pinnedAt || left?.createdAt || 0).getTime();
  const rightPinnedAt = new Date(right?.pinnedAt || right?.createdAt || 0).getTime();
  return rightPinnedAt - leftPinnedAt;
});

export const mergePinnedMessage = (messages = [], nextMessage) => {
  if (!nextMessage?._id) {
    return sortPinnedMessages(messages).slice(0, 10);
  }

  const nextMessages = messages.filter((message) => normalizeId(message?._id) !== normalizeId(nextMessage._id));

  if (!nextMessage.isPinned || nextMessage.isDeleted) {
    return sortPinnedMessages(nextMessages).slice(0, 10);
  }

  nextMessages.push(nextMessage);
  return sortPinnedMessages(nextMessages).slice(0, 10);
};
