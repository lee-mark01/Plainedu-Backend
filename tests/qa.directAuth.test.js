const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createQaDirectAuth } = require('../src/domains/qa/qa.directAuth');

test('direct QA authentication caps refresh credentials to the QA session', async () => {
  const saved = [];
  const service = createQaDirectAuth({
    repository: { saveRefreshToken: async (value) => saved.push(value) },
    tokenTools: {
      signAccessToken: (payload, expiresAt) => `access:${payload.qaSessionId}:${expiresAt.toISOString()}`,
      generateRefreshToken: () => 'refresh-token',
      hashToken: (token) => `hash:${token}`,
    },
    randomUUID: () => 'refresh-family',
  });
  const expiresAt = new Date('2026-08-17T09:00:00.000Z');

  const result = await service.issue({
    rootUserId: 41,
    qaSessionId: 'qa-session',
    expiresAt,
    email: 'qa@qa.invalid',
    displayName: 'QA 테스터',
    ipAddress: '127.0.0.1',
    userAgent: 'qa-test',
  });

  assert.match(result.accessToken, /^access:qa-session:/);
  assert.equal(result.refreshToken, 'refresh-token');
  assert.equal(result.user.qa_session_id, 'qa-session');
  assert.deepEqual(saved, [{
    userId: 41,
    tokenHash: 'hash:refresh-token',
    familyId: 'refresh-family',
    ipAddress: '127.0.0.1',
    userAgent: 'qa-test',
    expiresAt,
    absoluteExpiresAt: expiresAt,
  }]);
});
