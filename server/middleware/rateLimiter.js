const cacheService = require('../services/cacheService');

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
  max: process.env.NODE_ENV === 'production' ? 5 : 100,
  keyGenerator: (req) => req.ip
});

const messageLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip
});

const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000
});

module.exports = {
  createRateLimiter,
  authLimiter,
  messageLimiter,
  apiLimiter
};
