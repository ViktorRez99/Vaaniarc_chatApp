const authenticateToken = require('../server/middleware/auth');

describe('auth middleware helpers', () => {
  describe('requireCsrf', () => {
    const requireCsrf = authenticateToken.requireCsrf;

    const createResponse = () => {
      const response = {};
      response.status = jest.fn(() => response);
      response.json = jest.fn(() => response);
      return response;
    };

    it('skips safe methods', () => {
      const next = jest.fn();

      requireCsrf({
        method: 'GET',
        headers: {}
      }, createResponse(), next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects missing CSRF headers for session-backed mutations', () => {
      const res = createResponse();

      requireCsrf({
        method: 'POST',
        headers: {},
        authStrategy: 'session',
        session: {
          csrfTokenHash: 'hash'
        }
      }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'CSRF token required' });
    });

    it('allows matching CSRF cookie and header values', () => {
      const next = jest.fn();
      const csrfToken = 'csrf-token-123';

      requireCsrf({
        method: 'PATCH',
        headers: {
          cookie: `vaaniarc_csrf=${csrfToken}`,
          'x-csrf-token': csrfToken
        },
        authStrategy: 'session',
        session: {
          csrfTokenHash: require('crypto').createHash('sha256').update(csrfToken).digest('hex')
        }
      }, createResponse(), next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
