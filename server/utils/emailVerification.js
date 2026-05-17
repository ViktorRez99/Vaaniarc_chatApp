const crypto = require('crypto');

const DEFAULT_EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const hashEmailVerificationToken = (token) => crypto
  .createHash('sha256')
  .update(String(token || ''))
  .digest('hex');

const getEmailVerificationTtlMs = () => {
  const configuredTtl = Number.parseInt(process.env.EMAIL_VERIFICATION_TTL_MS || '', 10);
  return Number.isFinite(configuredTtl) && configuredTtl > 0
    ? configuredTtl
    : DEFAULT_EMAIL_VERIFICATION_TTL_MS;
};

const createEmailVerificationChallenge = () => {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + getEmailVerificationTtlMs());

  return {
    token,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt
  };
};

const getEmailVerificationBaseUrl = (req) => {
  const configuredBaseUrl = String(process.env.EMAIL_VERIFICATION_URL_BASE || process.env.FRONTEND_URL || '').trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  const protocol = req?.protocol || 'http';
  const host = req?.get?.('host') || `localhost:${process.env.PORT || 5000}`;
  return `${protocol}://${host}`;
};

const buildEmailVerificationUrl = (req, token) => (
  `${getEmailVerificationBaseUrl(req)}/verify-email?token=${encodeURIComponent(token)}`
);

const attachEmailVerificationChallenge = (user, challenge) => {
  user.emailVerified = false;
  user.emailVerificationTokenHash = challenge.tokenHash;
  user.emailVerificationExpiresAt = challenge.expiresAt;
};

const getDevelopmentVerificationHint = (req, token) => {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return buildEmailVerificationUrl(req, token);
};

module.exports = {
  attachEmailVerificationChallenge,
  buildEmailVerificationUrl,
  createEmailVerificationChallenge,
  getDevelopmentVerificationHint,
  hashEmailVerificationToken
};
