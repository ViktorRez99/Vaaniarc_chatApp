const net = require('net');
const http = require('http');
const {
  createClientEnv,
  findAvailablePort,
  normalizePort
} = require('../scripts/dev-full');
const { requestOnce } = require('../scripts/wait-for-backend');

const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => {
    if (error) {
      reject(error);
      return;
    }

    resolve();
  });
});

const listenServer = (server, port, host) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, host, () => {
    server.off('error', reject);
    resolve();
  });
});

describe('dev:full helpers', () => {
  it('normalizes invalid ports to a fallback value', () => {
    expect(normalizePort('not-a-port', 4321)).toBe(4321);
    expect(normalizePort('65536', 4321)).toBe(4321);
    expect(normalizePort('3005', 4321)).toBe(3005);
  });

  it('creates client env that points to the chosen backend', () => {
    const env = createClientEnv('127.0.0.1', 3007);

    expect(env.VITE_API_URL).toBe('http://127.0.0.1:3007');
    expect(env.VITE_SOCKET_URL).toBe('http://127.0.0.1:3007');
  });

  it('skips an occupied backend port', async () => {
    const occupiedServer = net.createServer();
    await listenServer(occupiedServer, 0, '127.0.0.1');

    try {
      const occupiedPort = occupiedServer.address().port;
      const availablePort = await findAvailablePort(occupiedPort, 50, '127.0.0.1');

      expect(availablePort).toBeGreaterThanOrEqual(occupiedPort);
      expect(availablePort).not.toBe(occupiedPort);
    } finally {
      await closeServer(occupiedServer);
    }
  });

  it('checks backend readiness over HTTP', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ready' }));
    });

    await listenServer(server, 0, '127.0.0.1');

    try {
      const port = server.address().port;
      const statusCode = await requestOnce(`http://127.0.0.1:${port}/api/health/ready`, 200);
      expect(statusCode).toBe(200);
    } finally {
      await closeServer(server);
    }
  });
});
