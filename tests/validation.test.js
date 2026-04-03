const {
  PASSWORD_POLICY,
  validatePassword
} = require('../server/utils/validation');

describe('validation', () => {
  it('rejects weak passwords that do not meet the hardened policy', () => {
    expect(validatePassword('short1!').isValid).toBe(false);
    expect(validatePassword('alllowercase123!').isValid).toBe(false);
    expect(validatePassword('ALLUPPERCASE123!').isValid).toBe(false);
    expect(validatePassword('NoSymbols123').isValid).toBe(false);
    expect(validatePassword('password1!A').isValid).toBe(false);
  });

  it('accepts strong passwords that meet the hardened policy', () => {
    const result = validatePassword('StrongPass123!');

    expect(PASSWORD_POLICY.minLength).toBeGreaterThanOrEqual(10);
    expect(result).toMatchObject({
      isValid: true
    });
  });
});
