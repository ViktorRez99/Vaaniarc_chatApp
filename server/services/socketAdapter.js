const { createAdapter } = require('@socket.io/redis-adapter');

const cacheService = require('./cacheService');
const logger = require('../utils/logger');

const adapterStatus = {
  mode: 'memory',
  enabled: false,
  lastError: null
};

let subClient = null;

const configureSocketAdapter = async (io) => {
  try {
    const connection = await cacheService.connect();

    if (!connection?.client || connection.mode !== 'redis') {
      adapterStatus.mode = 'memory';
      adapterStatus.enabled = false;
      adapterStatus.lastError = null;
      return adapterStatus;
    }

    if (!subClient) {
      subClient = connection.client.duplicate();
      subClient.on('error', (error) => {
        adapterStatus.lastError = error.message;
        logger.error('Socket adapter Redis subscriber error', error);
      });
      await subClient.connect();
    }

    io.adapter(createAdapter(connection.client, subClient));
    adapterStatus.mode = 'redis';
    adapterStatus.enabled = true;
    adapterStatus.lastError = null;
    return adapterStatus;
  } catch (error) {
    adapterStatus.mode = 'memory';
    adapterStatus.enabled = false;
    adapterStatus.lastError = error.message;
    logger.warn('Falling back to the in-process Socket.IO adapter', error.message);
    return adapterStatus;
  }
};

const getSocketAdapterStatus = () => ({
  ...adapterStatus
});

const closeSocketAdapter = async () => {
  if (!subClient) {
    return;
  }

  const client = subClient;
  subClient = null;

  try {
    if (client.isOpen) {
      await client.quit();
    }
  } catch (error) {
    if (client.isOpen) {
      client.disconnect();
    }
  } finally {
    adapterStatus.mode = 'memory';
    adapterStatus.enabled = false;
  }
};

module.exports = {
  closeSocketAdapter,
  configureSocketAdapter,
  getSocketAdapterStatus
};
