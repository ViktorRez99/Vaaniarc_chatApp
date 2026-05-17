const { createClient } = require('redis');

const logger = require('../utils/logger');

const DEFAULT_MEMORY_TTL_MS = 30000;
const REDIS_KEY_PREFIX = String(process.env.REDIS_KEY_PREFIX || 'vaaniarc').trim();

const redisState = {
  client: null,
  connectPromise: null,
  mode: process.env.REDIS_URL ? 'redis' : 'memory',
  connected: false,
  lastError: null
};

const memoryState = {
  cache: new Map(),
  rateLimits: new Map(),
  sessions: new Map()
};

const buildRedisKey = (namespace, key) => `${REDIS_KEY_PREFIX}:${namespace}:${key}`;

const serialize = (value) => JSON.stringify(value);
const deserialize = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const cleanupMemoryMap = (store, getExpiresAt) => {
  const now = Date.now();

  for (const [key, value] of store.entries()) {
    if (getExpiresAt(value) <= now) {
      store.delete(key);
    }
  }
};

const ensureRedisConnection = async () => {
  if (!process.env.REDIS_URL) {
    redisState.mode = 'memory';
    redisState.connected = false;
    redisState.connectPromise = null;
    return {
      mode: 'memory',
      client: null
    };
  }

  if (redisState.client && redisState.connected && redisState.client.isOpen) {
    return {
      mode: 'redis',
      client: redisState.client
    };
  }

  if (!redisState.connectPromise) {
    if (redisState.client && !redisState.client.isOpen) {
      redisState.client = null;
    }

    const client = createClient({
      url: process.env.REDIS_URL
    });

    client.on('ready', () => {
      redisState.connected = true;
      redisState.mode = 'redis';
      redisState.lastError = null;
      logger.info('Connected to Redis');
    });

    client.on('error', (error) => {
      redisState.lastError = error.message;
      logger.error('Redis connection error', error);
    });

    client.on('end', () => {
      redisState.connected = false;
      redisState.connectPromise = null;
      redisState.mode = process.env.REDIS_URL ? 'redis' : 'memory';
    });

    redisState.connectPromise = client.connect()
      .then(() => {
        redisState.client = client;
        redisState.connected = true;
        redisState.mode = 'redis';
        redisState.connectPromise = null;
        return {
          mode: 'redis',
          client
        };
      })
      .catch((error) => {
        redisState.lastError = error.message;
        redisState.connected = false;
        redisState.mode = 'memory';
        redisState.connectPromise = null;
        logger.warn('Redis unavailable, using in-memory cache', error.message);
        return {
          mode: 'memory',
          client: null
        };
      });
  }

  return redisState.connectPromise;
};

const deleteRedisKeysByPrefix = async (client, namespace, prefix) => {
  const match = buildRedisKey(namespace, `${prefix}*`);
  let cursor = '0';
  let deletedCount = 0;

  do {
    const result = await client.scan(cursor, {
      MATCH: match,
      COUNT: 100
    });
    cursor = result.cursor;

    if (Array.isArray(result.keys) && result.keys.length > 0) {
      deletedCount += result.keys.length;
      await client.del(result.keys);
    }
  } while (cursor !== '0');

  return deletedCount;
};

const cacheNamespace = {
  async get(key) {
    const connection = await ensureRedisConnection();

    if (connection.client) {
      return deserialize(await connection.client.get(buildRedisKey('cache', key)));
    }

    const entry = memoryState.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      memoryState.cache.delete(key);
      return undefined;
    }

    return entry.value;
  },

  async set(key, value, ttlMs = DEFAULT_MEMORY_TTL_MS) {
    const connection = await ensureRedisConnection();

    if (connection.client) {
      const redisKey = buildRedisKey('cache', key);
      if (ttlMs > 0) {
        await connection.client.set(redisKey, serialize(value), {
          PX: ttlMs
        });
      } else {
        await connection.client.set(redisKey, serialize(value));
      }
      return value;
    }

    memoryState.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
    return value;
  },

  async delete(key) {
    const connection = await ensureRedisConnection();

    if (connection.client) {
      await connection.client.del(buildRedisKey('cache', key));
      return;
    }

    memoryState.cache.delete(key);
  },

  async deleteByPrefix(prefix) {
    const connection = await ensureRedisConnection();

    if (connection.client) {
      return deleteRedisKeysByPrefix(connection.client, 'cache', prefix);
    }

    let deletedCount = 0;
    for (const key of memoryState.cache.keys()) {
      if (key.startsWith(prefix)) {
        memoryState.cache.delete(key);
        deletedCount += 1;
      }
    }

    return deletedCount;
  },

  async remember(key, ttlMs, loader) {
    const cachedValue = await this.get(key);

    if (cachedValue !== undefined && cachedValue !== null) {
      return cachedValue;
    }

    const nextValue = await loader();
    await this.set(key, nextValue, ttlMs);
    return nextValue;
  },

  cleanup() {
    cleanupMemoryMap(memoryState.cache, (value) => value.expiresAt);
  }
};

const rateLimitNamespace = {
  async increment(key, windowMs) {
    const connection = await ensureRedisConnection();

    if (connection.client) {
      const redisKey = buildRedisKey('ratelimit', key);
      const count = Number(await connection.client.incr(redisKey));
      let ttlMs = Number(await connection.client.pTTL(redisKey));

      if (!Number.isFinite(ttlMs) || ttlMs < 0) {
        await connection.client.pExpire(redisKey, windowMs);
        ttlMs = windowMs;
      }

      return {
        count,
        resetAt: Date.now() + ttlMs
      };
    }

    const now = Date.now();
    const existing = memoryState.rateLimits.get(key);

    if (!existing || existing.resetAt <= now) {
      const nextRecord = {
        count: 1,
        resetAt: now + windowMs
      };
      memoryState.rateLimits.set(key, nextRecord);
      return nextRecord;
    }

    existing.count += 1;
    return existing;
  },

  async decrement(key) {
    const connection = await ensureRedisConnection();

    if (connection.client) {
      const redisKey = buildRedisKey('ratelimit', key);
      const nextCount = Number(await connection.client.decr(redisKey));
      if (nextCount <= 0) {
        await connection.client.del(redisKey);
      }
      return;
    }

    const record = memoryState.rateLimits.get(key);
    if (record && record.count > 0) {
      record.count -= 1;
    }
  },

  async reset(key) {
    const connection = await ensureRedisConnection();

    if (connection.client) {
      await connection.client.del(buildRedisKey('ratelimit', key));
      return;
    }

    memoryState.rateLimits.delete(key);
  },

  cleanup() {
    cleanupMemoryMap(memoryState.rateLimits, (value) => value.resetAt);
  }
};

const sessionNamespace = {
  async get(tokenHash) {
    const connection = await ensureRedisConnection();

    if (connection.client) {
      return deserialize(await connection.client.get(buildRedisKey('session', tokenHash)));
    }

    const record = memoryState.sessions.get(tokenHash);
    if (!record) {
      return null;
    }

    if (record.expiresAt <= Date.now()) {
      memoryState.sessions.delete(tokenHash);
      return null;
    }

    return record.value;
  },

  async set(tokenHash, value, ttlMs) {
    const connection = await ensureRedisConnection();

    if (connection.client) {
      await connection.client.set(buildRedisKey('session', tokenHash), serialize(value), {
        PX: ttlMs
      });
      return value;
    }

    memoryState.sessions.set(tokenHash, {
      value,
      expiresAt: Date.now() + ttlMs
    });
    return value;
  },

  async touch(tokenHash, value, ttlMs) {
    return this.set(tokenHash, value, ttlMs);
  },

  async delete(tokenHash) {
    const connection = await ensureRedisConnection();

    if (connection.client) {
      await connection.client.del(buildRedisKey('session', tokenHash));
      return;
    }

    memoryState.sessions.delete(tokenHash);
  },

  cleanup() {
    cleanupMemoryMap(memoryState.sessions, (value) => value.expiresAt);
  }
};

const cleanupInterval = setInterval(() => {
  cacheNamespace.cleanup();
  rateLimitNamespace.cleanup();
  sessionNamespace.cleanup();
}, 60000);

if (typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

const cacheService = {
  async connect() {
    const connection = await ensureRedisConnection();
    const clusterEnabled = String(process.env.CLUSTER_ENABLED || '').toLowerCase() === 'true';
    const workerCount = Number.parseInt(process.env.WEB_CONCURRENCY || process.env.CLUSTER_WORKERS || '1', 10);

    if (clusterEnabled && workerCount > 1 && connection.mode !== 'redis') {
      throw new Error('Redis is required for cluster mode. Set REDIS_URL.');
    }

    return connection;
  },
  async disconnect() {
    const pendingConnection = redisState.connectPromise;
    let client = redisState.client;

    if (!client && pendingConnection) {
      try {
        const connection = await pendingConnection;
        client = connection?.client || redisState.client;
      } catch (error) {
        client = redisState.client;
      }
    }

    redisState.client = null;
    redisState.connectPromise = null;
    redisState.connected = false;
    redisState.mode = process.env.REDIS_URL ? 'redis' : 'memory';

    if (!client) {
      return;
    }

    try {
      if (client.isOpen) {
        await client.quit();
      }
    } catch (error) {
      if (client.isOpen) {
        client.disconnect();
      }
    }
  },
  getStatus() {
    return {
      mode: redisState.mode,
      redis: {
        configured: Boolean(process.env.REDIS_URL),
        connected: redisState.connected,
        lastError: redisState.lastError
      },
      memory: {
        cacheEntries: memoryState.cache.size,
        rateLimitEntries: memoryState.rateLimits.size,
        sessionEntries: memoryState.sessions.size
      }
    };
  },
  memory: cacheNamespace,
  rateLimit: rateLimitNamespace,
  session: sessionNamespace
};

module.exports = cacheService;
