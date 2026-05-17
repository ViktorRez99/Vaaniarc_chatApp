const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const TOTP_SECRET_PREFIX = 'enc:v1:';
const TOTP_SECRET_ALGORITHM = 'aes-256-gcm';
const TWO_FACTOR_CHALLENGE_EXPIRES_IN = '5m';

const isProduction = () => process.env.NODE_ENV === 'production';

const getChallengeSecret = () => {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (secret) {
    return secret;
  }

  if (isProduction()) {
    throw new Error('JWT_SECRET is required for 2FA login challenges.');
  }

  return 'dev-only-vaaniarc-2fa-challenge-secret';
};

const getTotpEncryptionKey = () => {
  const configuredKey = String(process.env.ENCRYPTION_KEY || '').trim();
  if (/^[a-fA-F0-9]{64}$/.test(configuredKey)) {
    return Buffer.from(configuredKey, 'hex');
  }

  if (isProduction()) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string.');
  }

  return crypto
    .createHash('sha256')
    .update(String(process.env.JWT_SECRET || 'dev-only-vaaniarc-totp-secret-key'))
    .digest();
};

const encryptTotpSecret = (secret) => {
  if (!secret || typeof secret !== 'string') {
    throw new Error('TOTP secret is required.');
  }

  if (secret.startsWith(TOTP_SECRET_PREFIX)) {
    return secret;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(TOTP_SECRET_ALGORITHM, getTotpEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return `${TOTP_SECRET_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
};

const decryptTotpSecret = (storedSecret) => {
  if (!storedSecret || typeof storedSecret !== 'string') {
    return '';
  }

  if (!storedSecret.startsWith(TOTP_SECRET_PREFIX)) {
    return storedSecret;
  }

  const payload = Buffer.from(storedSecret.slice(TOTP_SECRET_PREFIX.length), 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv(TOTP_SECRET_ALGORITHM, getTotpEncryptionKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString('utf8');
};

const createTwoFactorLoginChallenge = (userId, metadata = {}) => jwt.sign(
  {
    userId: userId?.toString?.() || String(userId || ''),
    step: '2fa',
    purpose: 'login',
    ...metadata
  },
  getChallengeSecret(),
  { expiresIn: TWO_FACTOR_CHALLENGE_EXPIRES_IN }
);

const verifyTwoFactorLoginChallenge = (partialToken) => {
  const decoded = jwt.verify(partialToken, getChallengeSecret());
  if (decoded?.step !== '2fa' || decoded?.purpose !== 'login' || !decoded?.userId) {
    throw new Error('Invalid 2FA login challenge.');
  }

  return decoded;
};

module.exports = {
  createTwoFactorLoginChallenge,
  decryptTotpSecret,
  encryptTotpSecret,
  verifyTwoFactorLoginChallenge
};
