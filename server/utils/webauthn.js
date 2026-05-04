const crypto = require('crypto');

const cacheService = require('../services/cacheService');

const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const LOOPBACK_IP_HOSTNAMES = new Set(['127.0.0.1', '::1', '[::1]']);

const normalizeOrigin = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue).origin;
  } catch (error) {
    return null;
  }
};

const parseOriginList = (value) => String(value || '')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const getDerivedRequestOrigin = (req) => {
  const headers = req?.headers || {};
  const protocolHeader = typeof headers['x-forwarded-proto'] === 'string'
    ? headers['x-forwarded-proto'].split(',')[0].trim()
    : '';
  const hostHeader = typeof headers['x-forwarded-host'] === 'string'
    ? headers['x-forwarded-host'].split(',')[0].trim()
    : headers.host;
  const protocol = protocolHeader || req?.protocol || 'http';

  if (!hostHeader) {
    return null;
  }

  return normalizeOrigin(`${protocol}://${hostHeader}`);
};

const getRequestOrigin = (req) => normalizeOrigin(req?.headers?.origin);

const getConfiguredOrigins = () => [
  ...parseOriginList(process.env.WEBAUTHN_ORIGINS),
  ...parseOriginList(process.env.ALLOWED_ORIGINS),
  normalizeOrigin(process.env.FRONTEND_URL),
  normalizeOrigin(process.env.CLIENT_URL)
].filter(Boolean);

const getExpectedOrigins = (req) => {
  const configuredOrigins = [
    getRequestOrigin(req),
    getDerivedRequestOrigin(req),
    ...getConfiguredOrigins()
  ].filter(Boolean);

  return [...new Set(configuredOrigins)];
};

const getRpId = (req) => {
  const configuredRpId = String(process.env.WEBAUTHN_RP_ID || '').trim();
  if (configuredRpId) {
    return configuredRpId;
  }

  const origin = getRequestOrigin(req)
    || getDerivedRequestOrigin(req)
    || getConfiguredOrigins()[0];
  if (origin) {
    const hostname = new URL(origin).hostname;
    return LOOPBACK_IP_HOSTNAMES.has(hostname) ? 'localhost' : hostname;
  }

  return 'localhost';
};

const getRpName = () => String(process.env.WEBAUTHN_RP_NAME || 'VaaniArc').trim() || 'VaaniArc';

const createAttemptId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${crypto.randomBytes(10).toString('hex')}`;
};

const buildChallengeCacheKey = (kind, attemptId) => `webauthn:${kind}:${attemptId}`;

const storeChallenge = async (kind, payload, ttlMs = DEFAULT_CHALLENGE_TTL_MS) => {
  const attemptId = createAttemptId();
  await cacheService.memory.set(buildChallengeCacheKey(kind, attemptId), payload, ttlMs);
  return attemptId;
};

const consumeChallenge = async (kind, attemptId) => {
  if (!attemptId) {
    return null;
  }

  const cacheKey = buildChallengeCacheKey(kind, attemptId);
  const payload = await cacheService.memory.get(cacheKey);
  await cacheService.memory.delete(cacheKey);
  return payload || null;
};

const toCredentialDescriptor = (passkey) => ({
  id: passkey.credentialID,
  transports: Array.isArray(passkey.transports) && passkey.transports.length > 0
    ? passkey.transports
    : undefined
});

const bufferToBase64Url = (value) => Buffer.from(value).toString('base64url');
const base64UrlToBuffer = (value) => Buffer.from(String(value || ''), 'base64url');

module.exports = {
  base64UrlToBuffer,
  bufferToBase64Url,
  consumeChallenge,
  getExpectedOrigins,
  getRpId,
  getRpName,
  storeChallenge,
  toCredentialDescriptor
};
