const cluster = require('cluster');
const express = require('express');

const cacheService = require('../services/cacheService');
const { getDatabaseStatus, isDatabaseReady } = require('../services/databaseService');
const { getBackgroundJobStatus } = require('../services/backgroundJobs');
const { getSocketAdapterStatus } = require('../services/socketAdapter');

const router = express.Router();
const startTime = Date.now();

router.get('/health', async (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    mongodb: getDatabaseStatus(),
    cache: cacheService.getStatus(),
    socketAdapter: getSocketAdapterStatus(),
    backgroundJobs: getBackgroundJobStatus(),
    cluster: {
      workerId: cluster.worker?.id || null,
      pid: process.pid
    },
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

router.get('/health/ready', async (req, res) => {
  const mongoReady = isDatabaseReady();
  const cacheStatus = cacheService.getStatus();
  const redisReady = !cacheStatus.redis.configured || cacheStatus.redis.connected;

  if (mongoReady && redisReady) {
    res.status(200).json({ status: 'ready' });
  } else {
    res.status(503).json({
      status: 'not ready',
      reason: !mongoReady ? 'MongoDB not connected' : 'Redis not connected',
      mongodb: getDatabaseStatus()
    });
  }
});

router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

module.exports = router;
