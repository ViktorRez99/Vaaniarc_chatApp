const { normalizeTempId } = require('../server/utils/messageIdempotency');

describe('messageIdempotency', () => {
  it('normalizes temp ids and rejects empty values', () => {
    expect(normalizeTempId('  temp-123  ')).toBe('temp-123');
    expect(normalizeTempId('')).toBeNull();
    expect(normalizeTempId('   ')).toBeNull();
    expect(normalizeTempId(null)).toBeNull();
  });
});
