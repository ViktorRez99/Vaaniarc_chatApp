const crypto = require('crypto');

const DEFAULT_PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

const hashPasswordResetToken = (token) => crypto
  .createHash('sha256')
  .update(String(token || ''))
  .digest('hex');

const getPasswordResetTtlMs = () => {
  const configuredTtl = Number.parseInt(process.env.PASSWORD_RESET_TTL_MS || '', 10);
  return Number.isFinite(configuredTtl) && configuredTtl > 0
    ? configuredTtl
    : DEFAULT_PASSWORD_RESET_TTL_MS;
};

const createPasswordResetChallenge = () => {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + getPasswordResetTtlMs());

  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt
  };
};

const getPasswordResetBaseUrl = (req) => {
  const configuredBaseUrl = String(process.env.PASSWORD_RESET_URL_BASE || process.env.FRONTEND_URL || '').trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  const protocol = req?.protocol || 'http';
  const host = req?.get?.('host') || `localhost:${process.env.PORT || 5000}`;
  return `${protocol}://${host}`;
};

const buildPasswordResetUrl = (req, token) => (
  `${getPasswordResetBaseUrl(req)}/auth?resetToken=${encodeURIComponent(token)}`
);

const attachPasswordResetChallenge = (user, challenge) => {
  user.passwordResetTokenHash = challenge.tokenHash;
  user.passwordResetExpiresAt = challenge.expiresAt;
};

const getDevelopmentPasswordResetHint = (req, token) => {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return buildPasswordResetUrl(req, token);
};

module.exports = {
  attachPasswordResetChallenge,
  createPasswordResetChallenge,
  getDevelopmentPasswordResetHint,
  hashPasswordResetToken
};
