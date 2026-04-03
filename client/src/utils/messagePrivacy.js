export const DISAPPEARING_MESSAGE_OPTIONS = [
  { seconds: null, label: 'Timer off', shortLabel: 'Off' },
  { seconds: 3600, label: '1 hour', shortLabel: '1h' },
  { seconds: 86400, label: '24 hours', shortLabel: '24h' },
  { seconds: 604800, label: '7 days', shortLabel: '7d' }
];

export const getDisappearingTimerOption = (seconds = null) => (
  DISAPPEARING_MESSAGE_OPTIONS.find((option) => option.seconds === seconds)
  || DISAPPEARING_MESSAGE_OPTIONS[0]
);

export const getNextDisappearingTimer = (seconds = null) => {
  const currentIndex = DISAPPEARING_MESSAGE_OPTIONS.findIndex((option) => option.seconds === seconds);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  return DISAPPEARING_MESSAGE_OPTIONS[(safeIndex + 1) % DISAPPEARING_MESSAGE_OPTIONS.length].seconds;
};

export const computeExpiresAt = (seconds, createdAt = Date.now()) => {
  if (!seconds) {
    return null;
  }

  return new Date(new Date(createdAt).getTime() + (seconds * 1000)).toISOString();
};

export const isExpiredMessage = (message, now = Date.now()) => {
  if (!message?.expiresAt) {
    return false;
  }

  return new Date(message.expiresAt).getTime() <= new Date(now).getTime();
};

export const markAttachmentConsumedLocally = (message) => {
  if (!message) {
    return message;
  }

  return {
    ...message,
    fileUrl: null,
    fileMetadata: null,
    decryptedFileMetadata: null,
    content: message?.content && typeof message.content === 'object'
      ? {
          ...message.content,
          text: 'View-once attachment already opened',
          file: null
        }
      : 'View-once attachment already opened',
    isViewOnceConsumed: true
  };
};
