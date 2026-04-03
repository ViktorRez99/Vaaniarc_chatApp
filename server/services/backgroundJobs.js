const logger = require('../utils/logger');

const DEFAULT_CONCURRENCY = Number.parseInt(process.env.BACKGROUND_JOB_CONCURRENCY || '2', 10);
const MAX_CONCURRENCY = Number.isFinite(DEFAULT_CONCURRENCY) && DEFAULT_CONCURRENCY > 0
  ? DEFAULT_CONCURRENCY
  : 2;

const queue = [];
let runningJobs = 0;
let jobCounter = 0;

const runNextJob = () => {
  while (runningJobs < MAX_CONCURRENCY && queue.length > 0) {
    const nextJob = queue.shift();
    runningJobs += 1;

    setImmediate(async () => {
      try {
        await nextJob.handler();
      } catch (error) {
        logger.error('Background job failed', {
          jobId: nextJob.id,
          name: nextJob.name,
          message: error.message
        });
      } finally {
        runningJobs -= 1;
        runNextJob();
      }
    });
  }
};

const enqueueBackgroundJob = (name, handler) => {
  const job = {
    id: `job-${Date.now()}-${++jobCounter}`,
    name: name || 'background-task',
    handler
  };

  queue.push(job);
  runNextJob();
  return job.id;
};

const getBackgroundJobStatus = () => ({
  queued: queue.length,
  running: runningJobs,
  concurrency: MAX_CONCURRENCY
});

module.exports = {
  enqueueBackgroundJob,
  getBackgroundJobStatus
};
