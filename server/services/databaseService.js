const mongoose = require('mongoose');

const logger = require('../utils/logger');

const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/chatapp';
const READY_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

const databaseState = {
  connectPromise: null,
  connectedAt: null,
  lastDisconnectedAt: null,
  lastError: null,
  listenersAttached: false,
  retryAttempts: 0,
  sanitizedUri: null
};

const sanitizeMongoUri = (uri) => {
  const rawUri = String(uri || '').trim();

  if (!rawUri) {
    return null;
  }

  try {
    const parsedUri = new URL(rawUri);

    if (parsedUri.username) {
      parsedUri.username = '***';
    }

    if (parsedUri.password) {
      parsedUri.password = '***';
    }

    return parsedUri.toString();
  } catch (error) {
    return rawUri.replace(/\/\/([^@]+)@/, '//***:***@');
  }
};

const getMongoUri = () => String(process.env.MONGODB_URI || DEFAULT_MONGODB_URI).trim();

const getMongoOptions = () => {
  const ipFamily = Number.parseInt(process.env.MONGODB_IP_FAMILY || '', 10);

  return {
    maxPoolSize: Number.parseInt(process.env.MONGODB_MAX_POOL_SIZE || '50', 10),
    minPoolSize: Number.parseInt(process.env.MONGODB_MIN_POOL_SIZE || '5', 10),
    serverSelectionTimeoutMS: Number.parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '5000', 10),
    connectTimeoutMS: Number.parseInt(process.env.MONGODB_CONNECT_TIMEOUT_MS || '10000', 10),
    socketTimeoutMS: Number.parseInt(process.env.MONGODB_SOCKET_TIMEOUT_MS || '45000', 10),
    autoIndex: process.env.NODE_ENV !== 'production',
    ...(Number.isFinite(ipFamily) ? { family: ipFamily } : {})
  };
};

const attachConnectionListeners = () => {
  if (databaseState.listenersAttached) {
    return;
  }

  mongoose.connection.on('connected', () => {
    databaseState.connectedAt = new Date().toISOString();
    databaseState.lastError = null;
    logger.info('Connected to MongoDB', {
      host: mongoose.connection.host || null,
      name: mongoose.connection.name || null
    });
  });

  mongoose.connection.on('error', (error) => {
    databaseState.lastError = error.message;
    logger.error('MongoDB connection error', error);
  });

  mongoose.connection.on('disconnected', () => {
    databaseState.lastDisconnectedAt = new Date().toISOString();
    logger.warn('MongoDB disconnected');
  });

  databaseState.listenersAttached = true;
};

const sleep = (durationMs) => new Promise((resolve) => {
  setTimeout(resolve, durationMs);
});

const synchronizeDatabaseIndexes = async () => {
  const User = require('../models/User');
  try {
    await User.ensureOptionalEmailIndex();
  } catch (error) {
    logger.warn('Skipping optional email index synchronization', {
      message: error.message
    });
  }
};

const connectToDatabase = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (databaseState.connectPromise) {
    return databaseState.connectPromise;
  }

  attachConnectionListeners();
  const mongoUri = getMongoUri();
  databaseState.sanitizedUri = sanitizeMongoUri(mongoUri);

  databaseState.connectPromise = mongoose.connect(mongoUri, getMongoOptions())
    .then(async () => {
      await synchronizeDatabaseIndexes();
      databaseState.connectPromise = null;
      return mongoose.connection;
    })
    .catch((error) => {
      databaseState.lastError = error.message;
      databaseState.connectPromise = null;
      throw error;
    });

  return databaseState.connectPromise;
};

const connectWithRetry = async () => {
  const maxRetries = Number.parseInt(process.env.MONGODB_CONNECT_RETRIES || '5', 10);
  const baseDelayMs = Number.parseInt(process.env.MONGODB_CONNECT_RETRY_DELAY_MS || '1000', 10);
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      databaseState.retryAttempts = attempt;
      return await connectToDatabase();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      attempt += 1;
      const retryDelayMs = Math.min(baseDelayMs * (2 ** (attempt - 1)), 30000);

      logger.warn('MongoDB connection attempt failed; retrying', {
        attempt,
        retryDelayMs,
        uri: databaseState.sanitizedUri
      });

      await sleep(retryDelayMs);
    }
  }

  return mongoose.connection;
};

const isDatabaseReady = () => process.env.NODE_ENV === 'test' || mongoose.connection.readyState === 1;

const getDatabaseStatus = () => ({
  status: READY_STATES[mongoose.connection.readyState] || 'unknown',
  readyState: mongoose.connection.readyState,
  host: mongoose.connection.host || null,
  name: mongoose.connection.name || null,
  uri: databaseState.sanitizedUri,
  connectedAt: databaseState.connectedAt,
  lastDisconnectedAt: databaseState.lastDisconnectedAt,
  lastError: databaseState.lastError,
  retryAttempts: databaseState.retryAttempts
});

module.exports = {
  connectToDatabase,
  connectWithRetry,
  getDatabaseStatus,
  isDatabaseReady
};
