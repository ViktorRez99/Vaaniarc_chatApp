/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

const logger = require('../utils/logger');

const DEFAULT_MEMORY_TTL_MS = 30000;

const memoryState = {
  cache: new Map(),
  rateLimits: new Map(),
  sessions: new Map()
};

const cleanupMemoryMap = (store, getExpiresAt) => {
  const now = Date.now();

  for (const [key, value] of store.entries()) {
    if (getExpiresAt(value) <= now) {
      store.delete(key);
    }
  }
};

const cacheNamespace = {
  async get(key) {
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
    memoryState.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
    return value;
  },

  async delete(key) {
    memoryState.cache.delete(key);
  },

  async deleteByPrefix(prefix) {
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
    const record = memoryState.rateLimits.get(key);
    if (record && record.count > 0) {
      record.count -= 1;
    }
  },

  async reset(key) {
    memoryState.rateLimits.delete(key);
  },

  cleanup() {
    cleanupMemoryMap(memoryState.rateLimits, (value) => value.resetAt);
  }
};

const sessionNamespace = {
  async get(tokenHash) {
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
    logger.info('Cache service using in-memory store');
    return { mode: 'memory', client: null };
  },
  async disconnect() {
    // No-op for in-memory store
  },
  getStatus() {
    return {
      mode: 'memory',
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
