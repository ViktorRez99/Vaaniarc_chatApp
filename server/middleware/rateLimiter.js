const cacheService = require('../services/cacheService');

const MAX_FAILED_ACCOUNT_ATTEMPTS = Number.parseInt(process.env.AUTH_ACCOUNT_LOCKOUT_ATTEMPTS || '5', 10);
const ACCOUNT_LOCKOUT_DURATION_MS = Number.parseInt(
  process.env.AUTH_ACCOUNT_LOCKOUT_MS || String(15 * 60 * 1000),
  10
);

const resolveClientIdentity = (req) => {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const ipAddress = typeof forwardedFor === 'string' && forwardedFor.trim()
    ? forwardedFor.split(',')[0].trim()
    : (req.ip || req.connection?.remoteAddress || 'anonymous');
  const identifier = String(
    req.body?.identifier
    || req.body?.email
    || req.body?.username
    || ''
  ).trim().toLowerCase();

  return identifier ? `${ipAddress}:${identifier}` : ipAddress;
};

const createRateLimiter = (options) => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    keyGenerator = (req) => req.ip || req.user?._id?.toString() || 'anonymous',
    skip = () => false
  } = options;

  return async (req, res, next) => {
    if (skip(req)) return next();

    const key = `ratelimit::${keyGenerator(req)}`;
    const { count, resetAt } = await cacheService.rateLimit.increment(key, windowMs);

    res.set({
      'X-RateLimit-Limit': max,
      'X-RateLimit-Remaining': Math.max(0, max - count),
      'X-RateLimit-Reset': new Date(resetAt).toISOString()
    });

    if (count > max) {
      return res.status(429).json({
        message: 'Too many requests, please try again later.',
        retryAfter: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
      });
    }

    next();
  };
};

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 25,
  keyGenerator: resolveClientIdentity
});

const messageLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip
});

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  keyGenerator: (req) => req.user?._id?.toString() || resolveClientIdentity(req)
});

const normalizeLockoutIdentifier = (identifier) => String(identifier || '').trim().toLowerCase();
const getAccountLockoutKey = (identifier) => `auth-lockout::${normalizeLockoutIdentifier(identifier)}`;

const checkAccountLockout = async (identifier) => {
  const normalizedIdentifier = normalizeLockoutIdentifier(identifier);
  if (!normalizedIdentifier) {
    return null;
  }

  const record = await cacheService.memory.get(getAccountLockoutKey(normalizedIdentifier));
  if (!record?.firstAttemptAt || !Number.isFinite(Number(record.count))) {
    return null;
  }

  const elapsedMs = Date.now() - Number(record.firstAttemptAt);
  if (elapsedMs >= ACCOUNT_LOCKOUT_DURATION_MS) {
    await cacheService.memory.delete(getAccountLockoutKey(normalizedIdentifier));
    return null;
  }

  if (Number(record.count) < MAX_FAILED_ACCOUNT_ATTEMPTS) {
    return null;
  }

  return {
    locked: true,
    retryAfterSeconds: Math.max(1, Math.ceil((ACCOUNT_LOCKOUT_DURATION_MS - elapsedMs) / 1000))
  };
};

const recordFailedAttempt = async (identifier) => {
  const normalizedIdentifier = normalizeLockoutIdentifier(identifier);
  if (!normalizedIdentifier) {
    return;
  }

  const key = getAccountLockoutKey(normalizedIdentifier);
  const existing = await cacheService.memory.get(key);
  const now = Date.now();

  if (!existing?.firstAttemptAt || now - Number(existing.firstAttemptAt) >= ACCOUNT_LOCKOUT_DURATION_MS) {
    await cacheService.memory.set(key, { count: 1, firstAttemptAt: now }, ACCOUNT_LOCKOUT_DURATION_MS);
    return;
  }

  await cacheService.memory.set(
    key,
    {
      count: Number(existing.count || 0) + 1,
      firstAttemptAt: Number(existing.firstAttemptAt)
    },
    ACCOUNT_LOCKOUT_DURATION_MS
  );
};

const clearFailedAttempts = async (identifier) => {
  const normalizedIdentifier = normalizeLockoutIdentifier(identifier);
  if (!normalizedIdentifier) {
    return;
  }

  await cacheService.memory.delete(getAccountLockoutKey(normalizedIdentifier));
};

module.exports = {
  createRateLimiter,
  authLimiter,
  messageLimiter,
  apiLimiter,
  checkAccountLockout,
  clearFailedAttempts,
  recordFailedAttempt
};
