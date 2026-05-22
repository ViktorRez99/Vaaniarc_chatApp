/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

const logger = require('../utils/logger');

const adapterStatus = {
  mode: 'memory',
  enabled: false,
  lastError: null
};

const configureSocketAdapter = async (io) => {
  // Using the default in-memory Socket.IO adapter
  adapterStatus.mode = 'memory';
  adapterStatus.enabled = false;
  adapterStatus.lastError = null;
  logger.info('Socket.IO using default in-memory adapter');
  return adapterStatus;
};

const getSocketAdapterStatus = () => ({
  ...adapterStatus
});

const closeSocketAdapter = async () => {
  // No-op for in-memory adapter
  adapterStatus.mode = 'memory';
  adapterStatus.enabled = false;
};

module.exports = {
  closeSocketAdapter,
  configureSocketAdapter,
  getSocketAdapterStatus
};
