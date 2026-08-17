const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

test('QA access token expiry is capped by the earlier session deadline', () => {
  process.env.JWT_ACCESS_SECRET = 'qa-expiry-test-secret';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
  const { signAccessToken } = require('../src/utils/jwt');
  const deadline = new Date(Date.now() + 30_000);
  const token = signAccessToken({ userId: 1, qaSessionId: 'session-a' }, deadline);
  const decoded = jwt.decode(token);
  assert.ok(decoded.exp * 1000 <= deadline.getTime());
  assert.ok(decoded.exp * 1000 > Date.now());
});
