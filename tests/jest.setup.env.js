// Runs before any test file; must run before server/server.js is loaded
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'jest-test-jwt-secret-do-not-use-in-prod';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
// Optional: point tests at a real DB for integration tests (register/login)
// process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/vaaniarc_jest';
