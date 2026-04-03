const {
  buildPrivacyFields,
  hasUserConsumedViewOnce,
  isMessageExpired,
  markViewOnceConsumed,
  redactPrivateMessageForUser,
  redactRoomMessageForUser,
  sanitizePrivacyInput
} = require('../server/utils/messagePrivacy');

describe('messagePrivacy', () => {
  it('normalizes privacy input', () => {
    expect(sanitizePrivacyInput({ expiresInSeconds: '3600', isViewOnce: 'true' })).toEqual({
      expiresInSeconds: 3600,
      isViewOnce: true
    });

    expect(sanitizePrivacyInput({ expiresInSeconds: null, isViewOnce: false })).toEqual({
      expiresInSeconds: null,
      isViewOnce: false
    });
  });

  it('rejects invalid timers', () => {
    expect(() => sanitizePrivacyInput({ expiresInSeconds: 30 })).toThrow(/disappearing timer/i);
    expect(() => sanitizePrivacyInput({ expiresInSeconds: 'abc' })).toThrow(/disappearing timer/i);
  });

  it('builds expiresAt from the timer', () => {
    const baseDate = new Date('2026-01-01T00:00:00.000Z');
    const privacyFields = buildPrivacyFields({ expiresInSeconds: 3600, isViewOnce: true }, baseDate);

    expect(privacyFields.expiresInSeconds).toBe(3600);
    expect(privacyFields.isViewOnce).toBe(true);
    expect(privacyFields.expiresAt.toISOString()).toBe('2026-01-01T01:00:00.000Z');
  });

  it('marks and detects consumed view-once attachments', () => {
    const message = {
      sender: 'sender-1',
      isViewOnce: true,
      viewedBy: []
    };

    expect(markViewOnceConsumed(message, 'recipient-1')).toBe(true);
    expect(hasUserConsumedViewOnce(message, 'recipient-1')).toBe(true);
    expect(markViewOnceConsumed(message, 'recipient-1')).toBe(false);
    expect(hasUserConsumedViewOnce(message, 'sender-1')).toBe(false);
  });

  it('redacts private messages for consumed view-once attachments', () => {
    const message = {
      sender: 'sender-1',
      isViewOnce: true,
      viewedBy: [{ user: 'recipient-1', viewedAt: new Date() }],
      fileUrl: '/uploads/test.vaani',
      fileMetadata: { originalName: 'secret.png' },
      content: 'secret.png'
    };

    expect(redactPrivateMessageForUser(message, 'recipient-1')).toMatchObject({
      fileUrl: null,
      fileMetadata: null,
      content: 'View-once attachment already opened',
      isViewOnceConsumed: true
    });
  });

  it('redacts room messages for consumed view-once attachments', () => {
    const message = {
      sender: 'sender-1',
      isViewOnce: true,
      viewedBy: [{ user: 'recipient-1', viewedAt: new Date() }],
      content: {
        text: 'secret.png',
        file: { url: '/uploads/test.vaani' }
      }
    };

    expect(redactRoomMessageForUser(message, 'recipient-1')).toMatchObject({
      isViewOnceConsumed: true,
      content: {
        text: 'View-once attachment already opened',
        file: null
      }
    });
  });

  it('detects expired messages', () => {
    expect(isMessageExpired({ expiresAt: new Date('2025-01-01T00:00:00.000Z') }, new Date('2026-01-01T00:00:00.000Z'))).toBe(true);
    expect(isMessageExpired({ expiresAt: new Date('2027-01-01T00:00:00.000Z') }, new Date('2026-01-01T00:00:00.000Z'))).toBe(false);
  });
});
