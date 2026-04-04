const net = require('net');
const path = require('path');
const concurrently = require('concurrently');

const DEFAULT_BACKEND_HOST = process.env.VAANIARC_DEV_HOST || '127.0.0.1';
const DEFAULT_BACKEND_PORT = 3000;
const PORT_SCAN_LIMIT = 20;
const repoRoot = path.resolve(__dirname, '..');

const normalizePort = (value, fallback = DEFAULT_BACKEND_PORT) => {
  const parsedPort = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536
    ? parsedPort
    : fallback;
};

const isPortAvailable = (port, host) => new Promise((resolve) => {
  const probe = net.createServer();
  probe.unref();
  probe.once('error', () => {
    resolve(false);
  });
  const listenOptions = typeof host === 'string' && host.length > 0
    ? { port, host }
    : { port };
  probe.listen(listenOptions, () => {
    probe.close(() => resolve(true));
  });
});

const findAvailablePort = async (
  startPort,
  maxAttempts = PORT_SCAN_LIMIT,
  host
) => {
  const initialPort = normalizePort(startPort);

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidatePort = initialPort + offset;
    if (await isPortAvailable(candidatePort, host)) {
      return candidatePort;
    }
  }

  throw new Error(
    `Unable to find an open backend port between ${initialPort} and ${initialPort + maxAttempts - 1}.`
  );
};

const createClientEnv = (backendHost, backendPort) => ({
  VITE_API_URL: `http://${backendHost}:${backendPort}`,
  VITE_SOCKET_URL: `http://${backendHost}:${backendPort}`
});

const run = async () => {
  const preferredBackendPort = normalizePort(process.env.PORT);
  const backendPort = await findAvailablePort(preferredBackendPort, PORT_SCAN_LIMIT);

  if (backendPort !== preferredBackendPort) {
    console.warn(
      `[dev:full] Port ${preferredBackendPort} is busy. Starting the backend on ${backendPort} instead.`
    );
  }

  console.log(`[dev:full] Backend: http://${DEFAULT_BACKEND_HOST}:${backendPort}`);
  console.log('[dev:full] Frontend: Vite will use http://127.0.0.1:5173 unless that port is busy.');
  console.log('[dev:full] Client startup is gated on backend readiness.');

  const backendReadyUrl = `http://${DEFAULT_BACKEND_HOST}:${backendPort}/api/health/ready`;

  const { result } = concurrently([
    {
      command: 'npm run dev',
      name: 'server',
      cwd: repoRoot,
      env: {
        PORT: String(backendPort)
      }
    },
    {
      command: `node scripts/wait-for-backend.js ${backendReadyUrl} && npm run client`,
      name: 'client',
      cwd: repoRoot,
      env: createClientEnv(DEFAULT_BACKEND_HOST, backendPort)
    }
  ], {
    killOthers: ['failure', 'success'],
    successCondition: 'all',
    prefix: 'name'
  });

  await result;
};

if (require.main === module) {
  run().catch((error) => {
    console.error(`[dev:full] ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  createClientEnv,
  findAvailablePort,
  isPortAvailable,
  normalizePort
};
