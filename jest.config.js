/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  passWithNoTests: true,
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: true
};
