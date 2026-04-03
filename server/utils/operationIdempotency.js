const cacheService = require('../services/cacheService');

const DEFAULT_IDEMPOTENCY_TTL_MS = 60 * 60 * 1000;

const extractIdempotencyKey = (req) => {
  const headerKey = typeof req?.headers?.['x-idempotency-key'] === 'string'
    ? req.headers['x-idempotency-key'].trim()
    : '';
  if (headerKey) {
    return headerKey;
  }

  const bodyKey = typeof req?.body?.idempotencyKey === 'string'
    ? req.body.idempotencyKey.trim()
    : '';
  if (bodyKey) {
    return bodyKey;
  }

  const queryKey = typeof req?.query?.idempotencyKey === 'string'
    ? req.query.idempotencyKey.trim()
    : '';

  return queryKey || null;
};

const requireIdempotencyKey = (req, res) => {
  const idempotencyKey = extractIdempotencyKey(req);

  if (!idempotencyKey) {
    res.status(400).json({
      message: 'An idempotency key is required for this operation.'
    });
    return null;
  }

  return idempotencyKey;
};

const buildOperationCacheKey = ({ scope, userId, idempotencyKey }) => (
  `idempotency:${scope}:${String(userId || '').trim()}:${idempotencyKey}`
);

const loadIdempotentResponse = async ({ scope, userId, idempotencyKey }) => {
  const cacheKey = buildOperationCacheKey({ scope, userId, idempotencyKey });
  const cachedPayload = await cacheService.memory.get(cacheKey);

  return cachedPayload || null;
};

const storeIdempotentResponse = async ({
  scope,
  userId,
  idempotencyKey,
  payload,
  ttlMs = DEFAULT_IDEMPOTENCY_TTL_MS
}) => {
  const cacheKey = buildOperationCacheKey({ scope, userId, idempotencyKey });
  await cacheService.memory.set(cacheKey, payload, ttlMs);
  return payload;
};

module.exports = {
  DEFAULT_IDEMPOTENCY_TTL_MS,
  extractIdempotencyKey,
  requireIdempotencyKey,
  loadIdempotentResponse,
  storeIdempotentResponse
};
