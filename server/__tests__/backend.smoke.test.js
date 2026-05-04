const fs = require('fs');
const path = require('path');
const request = require('supertest');

const { app, server, io } = require('../server');
const { AppError, errorHandler } = require('../middleware/errorHandler');
const PasskeyCredential = require('../models/PasskeyCredential');
const { requirePasskeyEnrollment } = require('../utils/passkeyEnrollment');

const projectRoot = path.resolve(__dirname, '../..');

const restoreEnvValue = (key, value) => {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
};

const createMockResponse = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  }
});

afterAll(async () => {
  io.close();

  if (server.listening) {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
});

describe('backend smoke checks', () => {
  test('serves the API root document', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: 'VaaniArc API Server',
      status: 'running'
    });
    expect(response.body.endpoints).toHaveProperty('health', '/api/health');
  });

  test('serves health, liveness, and readiness checks', async () => {
    const [health, live, ready] = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/health/live'),
      request(app).get('/api/health/ready')
    ]);

    expect(health.status).toBe(200);
    expect(health.body).toHaveProperty('mongodb');
    expect(health.body).toHaveProperty('cache');
    expect(live.status).toBe(200);
    expect(live.body).toEqual({ status: 'alive' });
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready' });
  });

  test('protects authenticated API routes', async () => {
    const response = await request(app).get('/api/auth/profile');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'Access token or session required' });
  });
});

describe('deployment configuration', () => {
  test('starts the real backend entrypoint in production deploys', () => {
    const packageJson = require(path.join(projectRoot, 'package.json'));
    const procfile = fs.readFileSync(path.join(projectRoot, 'Procfile'), 'utf8').trim();
    const railwayConfig = fs.readFileSync(path.join(projectRoot, 'railway.toml'), 'utf8');

    expect(packageJson.scripts.start).toBe('node server/entry.js');
    expect(procfile).toBe('web: npm start');
    expect(railwayConfig).toContain('startCommand = "npm start"');
  });
});

describe('WebAuthn origin handling', () => {
  test('derives RP ID from the active browser origin before configured fallback origins', () => {
    const originalFrontendUrl = process.env.FRONTEND_URL;
    const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;
    const originalWebAuthnOrigins = process.env.WEBAUTHN_ORIGINS;
    const originalRpId = process.env.WEBAUTHN_RP_ID;

    try {
      process.env.FRONTEND_URL = 'http://127.0.0.1:5173';
      process.env.ALLOWED_ORIGINS = '';
      process.env.WEBAUTHN_ORIGINS = '';
      delete process.env.WEBAUTHN_RP_ID;

      const { getExpectedOrigins, getRpId } = require('../utils/webauthn');
      const request = {
        headers: {
          origin: 'http://127.0.0.1:5173',
          host: '127.0.0.1:3000'
        },
        protocol: 'http'
      };

      expect(getRpId(request)).toBe('localhost');
      expect(getExpectedOrigins(request)).toEqual([
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000'
      ]);
    } finally {
      restoreEnvValue('FRONTEND_URL', originalFrontendUrl);
      restoreEnvValue('ALLOWED_ORIGINS', originalAllowedOrigins);
      restoreEnvValue('WEBAUTHN_ORIGINS', originalWebAuthnOrigins);
      restoreEnvValue('WEBAUTHN_RP_ID', originalRpId);
    }
  });

  test('serves passkey login options for the active browser origin', async () => {
    const response = await request(app)
      .post('/api/auth/webauthn/authenticate/options')
      .set('Origin', 'http://localhost:5173')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('attemptId');
    expect(response.body.options).toMatchObject({
      rpId: 'localhost',
      userVerification: 'required'
    });
    expect(response.body.options).not.toHaveProperty('allowCredentials');
  });
});

describe('mandatory passkey policy', () => {
  test('blocks protected APIs until a passkey is enrolled', async () => {
    const countSpy = jest.spyOn(PasskeyCredential, 'countDocuments').mockResolvedValue(0);
    const req = { user: { _id: '507f1f77bcf86cd799439011' } };
    const res = createMockResponse();
    const next = jest.fn();

    await requirePasskeyEnrollment(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      code: 'PASSKEY_REQUIRED',
      passkeyRequired: true,
      hasPasskey: false
    });
    expect(next).not.toHaveBeenCalled();

    countSpy.mockRestore();
  });

  test('allows protected APIs after a passkey is enrolled', async () => {
    const countSpy = jest.spyOn(PasskeyCredential, 'countDocuments').mockResolvedValue(1);
    const req = { user: { _id: '507f1f77bcf86cd799439011' } };
    const res = createMockResponse();
    const next = jest.fn();

    await requirePasskeyEnrollment(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.passkeyEnrollment).toEqual({
      hasPasskey: true,
      passkeyRequired: false
    });

    countSpy.mockRestore();
  });
});

describe('error handling', () => {
  test('sends operational errors outside development', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const response = createMockResponse();

    errorHandler(new AppError('Missing record', 404), {}, response, jest.fn());

    process.env.NODE_ENV = originalNodeEnv;
    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({
      status: 'fail',
      message: 'Missing record'
    });
  });

  test('hides unexpected error details outside development', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NODE_ENV = 'test';
    const response = createMockResponse();

    errorHandler(new Error('database password leaked here'), {}, response, jest.fn());

    consoleErrorSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({
      status: 'error',
      message: 'Something went wrong. Please try again later.'
    });
  });
});

describe('push notification configuration', () => {
  test('treats invalid VAPID keys as disabled push support', () => {
    const originalPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const originalPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    const originalSubject = process.env.WEB_PUSH_SUBJECT;
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'replace_with_generated_public_key';
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'replace_with_generated_private_key';
      process.env.WEB_PUSH_SUBJECT = 'https://example.com';

      jest.isolateModules(() => {
        const { hasPushConfiguration } = require('../services/pushService');
        expect(hasPushConfiguration()).toBe(false);
      });
    } finally {
      consoleWarnSpy.mockRestore();
      restoreEnvValue('WEB_PUSH_VAPID_PUBLIC_KEY', originalPublicKey);
      restoreEnvValue('WEB_PUSH_VAPID_PRIVATE_KEY', originalPrivateKey);
      restoreEnvValue('WEB_PUSH_SUBJECT', originalSubject);
    }
  });
});
