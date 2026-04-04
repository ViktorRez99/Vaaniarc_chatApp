const http = require('http');
const https = require('https');

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_INTERVAL_MS = 500;

const parsePositiveInt = (value, fallback) => {
  const parsedValue = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const getWaitOptions = (overrides = {}) => ({
  targetUrl: overrides.targetUrl || process.argv[2],
  timeoutMs: parsePositiveInt(overrides.timeoutMs ?? process.env.VAANIARC_WAIT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  intervalMs: parsePositiveInt(overrides.intervalMs ?? process.env.VAANIARC_WAIT_INTERVAL_MS, DEFAULT_INTERVAL_MS)
});

const requestOnce = (url, intervalMs = DEFAULT_INTERVAL_MS) => new Promise((resolve, reject) => {
  const client = url.startsWith('https:') ? https : http;
  const request = client.get(url, (response) => {
    response.resume();
    resolve(response.statusCode || 0);
  });

  request.setTimeout(Math.min(intervalMs, 5000), () => {
    request.destroy(new Error('Request timed out'));
  });

  request.on('error', reject);
});

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const waitForBackend = async (overrides = {}) => {
  const { targetUrl, timeoutMs, intervalMs } = getWaitOptions(overrides);

  if (!targetUrl) {
    throw new Error('Missing target URL.');
  }

  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;

    try {
      const statusCode = await requestOnce(targetUrl, intervalMs);
      if (statusCode === 200) {
        console.log(`[wait-for-backend] Ready after ${attempt} check(s): ${targetUrl}`);
        return;
      }
    } catch (error) {
      if (Date.now() + intervalMs >= deadline) {
        console.error(`[wait-for-backend] ${error.message}`);
      }
    }

    await sleep(intervalMs);
  }

  console.error(`[wait-for-backend] Timed out after ${timeoutMs}ms waiting for ${targetUrl}`);
  process.exit(1);
};

if (require.main === module) {
  waitForBackend().catch((error) => {
    console.error(`[wait-for-backend] ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  getWaitOptions,
  parsePositiveInt,
  requestOnce,
  waitForBackend
};
