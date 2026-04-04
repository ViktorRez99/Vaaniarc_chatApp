const request = require('supertest');
const User = require('../server/models/User');

// Load app after env from setupFiles
const { app } = require('../server/server');

describe('VaaniArc API', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('public routes', () => {
    it('GET / returns API metadata', async () => {
      const res = await request(app).get('/').expect(200);
      expect(res.body).toMatchObject({
        message: 'VaaniArc API Server',
        status: 'running'
      });
      expect(res.body.endpoints).toHaveProperty('health');
    });

    it('GET /api/health returns ok payload', async () => {
      const res = await request(app).get('/api/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok' });
      expect(res.body).toHaveProperty('mongodb');
      expect(res.body).toHaveProperty('uptime');
    });

    it('GET /api/health/live returns alive', async () => {
      const res = await request(app).get('/api/health/live').expect(200);
      expect(res.body).toMatchObject({ status: 'alive' });
    });
  });

  describe('auth validation (no DB write)', () => {
    it('POST /api/auth/register rejects empty body', async () => {
      const res = await request(app).post('/api/auth/register').send({}).expect(400);
      expect(res.body.message).toBeDefined();
    });

    it('POST /api/auth/register rejects short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'validuser',
          password: '12345'
        })
        .expect(400);
      expect(String(res.body.message).toLowerCase()).toMatch(/password|6/);
    });

    it('POST /api/auth/register rejects invalid optional email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'validuser',
          email: 'not-an-email',
          password: 'StrongPass123!'
        })
        .expect(400);

      expect(String(res.body.message).toLowerCase()).toMatch(/valid email/);
    });

    it('POST /api/auth/login rejects missing credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({}).expect(400);
      expect(res.body.message).toBeDefined();
    });

    it('POST /api/auth/login handles a populated request without throwing', async () => {
      const findOneSpy = jest.spyOn(User, 'findOne').mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          identifier: 'validuser',
          password: 'StrongPass123!'
        })
        .expect(401);

      expect(res.body.message).toBe('Invalid credentials');
      expect(findOneSpy).toHaveBeenCalledWith({
        $or: [
          { username: 'validuser' },
          { email: 'validuser' }
        ],
        isActive: true
      });
    });
  });

  describe('protected routes', () => {
    const protectedEndpoints = [
      ['get', '/api/auth/profile'],
      ['get', '/api/auth/verify'],
      ['get', '/api/chats'],
      ['get', '/api/conversations'],
      ['get', '/api/channels'],
      ['get', '/api/communities'],
      ['get', '/api/rooms'],
      ['get', '/api/meetings'],
      ['get', '/api/devices'],
      ['get', '/api/notifications/config'],
      ['post', '/api/keys/identity'],
      ['post', '/api/upload/avatar'],
    ];

    it.each(protectedEndpoints)('%s %s rejects missing token', async (method, endpoint) => {
      const res = await request(app)[method](endpoint).expect(401);
      expect(String(res.body.message || '')).toMatch(/token|access/i);
    });

    it('GET /api/auth/profile rejects invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);

      expect(String(res.body.message || '')).toMatch(/invalid|expired/i);
    });
  });
});
