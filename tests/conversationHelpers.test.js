const {
  buildConversationId,
  parseConversationId
} = require('../server/utils/conversationHelpers');

describe('conversationHelpers', () => {
  it('builds stable conversation ids', () => {
    expect(buildConversationId('direct', 'abc123')).toBe('direct_abc123');
    expect(buildConversationId('group', 'room42')).toBe('group_room42');
    expect(buildConversationId('channel', 'chan99')).toBe('channel_chan99');
  });

  it('parses valid conversation ids', () => {
    expect(parseConversationId('direct_abc123')).toEqual({
      type: 'direct',
      sourceId: 'abc123'
    });
    expect(parseConversationId('channel_chan99')).toEqual({
      type: 'channel',
      sourceId: 'chan99'
    });
  });

  it('rejects invalid conversation ids', () => {
    expect(parseConversationId('abc123')).toBeNull();
    expect(parseConversationId('unknown_abc123')).toBeNull();
    expect(parseConversationId('group_')).toBeNull();
  });

  it('rejects invalid build requests', () => {
    expect(() => buildConversationId('unknown', 'abc123')).toThrow(/invalid/i);
    expect(() => buildConversationId('direct', '')).toThrow(/required/i);
  });
});
