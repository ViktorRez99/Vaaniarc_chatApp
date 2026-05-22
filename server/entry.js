/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

const cluster = require('cluster');
const os = require('os');
const { installSafeConsole } = require('./utils/safeConsole');

installSafeConsole();

const workerCountFromEnv = Number.parseInt(process.env.WEB_CONCURRENCY || process.env.CLUSTER_WORKERS || '', 10);
const availableCpuCount = typeof os.availableParallelism === 'function'
  ? os.availableParallelism()
  : os.cpus().length;
const workerCount = Number.isFinite(workerCountFromEnv) && workerCountFromEnv > 0
  ? workerCountFromEnv
  : Math.max(1, availableCpuCount);
const clusterEnabled = String(process.env.CLUSTER_ENABLED || '').toLowerCase() === 'true';

if (clusterEnabled && cluster.isPrimary && workerCount > 1) {
  if (!process.env.REDIS_URL) {
    console.error('FATAL: REDIS_URL must be set when CLUSTER_ENABLED=true and multiple workers are enabled.');
    process.exit(1);
  }

  for (let index = 0; index < workerCount; index += 1) {
    cluster.fork();
  }

  cluster.on('exit', () => {
    cluster.fork();
  });
} else {
  require('./server');
}
