const {
  SECURE_TEXT_PLACEHOLDER,
  resolveStoredTextContent
} = require('../server/utils/secureMessaging');

describe('secureMessaging', () => {
  it('stores plaintext for non-encrypted messages', () => {
    expect(resolveStoredTextContent({
      plaintext: ' hello world ',
      encryptedContent: null
    })).toBe('hello world');
  });

  it('normalizes encrypted messages to a placeholder', () => {
    expect(resolveStoredTextContent({
      plaintext: '',
      encryptedContent: '{"version":3}'
    })).toBe(SECURE_TEXT_PLACEHOLDER);

    expect(resolveStoredTextContent({
      plaintext: SECURE_TEXT_PLACEHOLDER,
      encryptedContent: '{"version":3}'
    })).toBe(SECURE_TEXT_PLACEHOLDER);
  });

  it('rejects plaintext leakage alongside encrypted payloads', () => {
    expect(() => resolveStoredTextContent({
      plaintext: 'secret message',
      encryptedContent: '{"version":3}'
    })).toThrow(/plaintext content/i);
  });
});
