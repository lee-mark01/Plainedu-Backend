const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createRefreshService } = require('../src/domains/auth/refresh.service');

const createHarness = ({ user, storedOverrides = {} }) => {
  const calls = [];
  const stored = {
    user_id: user.id,
    family_id: 'family-id',
    used: 0,
    expires_at: new Date('2026-08-20T00:00:00.000Z'),
    absolute_expires_at: new Date('2026-11-01T00:00:00.000Z'),
    ...storedOverrides,
  };
  const repository = {
    findRefreshToken: async () => stored,
    findUserById: async () => user,
    rotateRefreshToken: async (value) => calls.push(['rotate', value]),
    deleteRefreshTokenFamily: async (id) => calls.push(['delete-family', id]),
  };
  const accessPayloads = [];
  const service = createRefreshService({
    repository,
    tokenTools: {
      hashToken: (value) => `hash:${value}`,
      signAccessToken: (payload) => {
        accessPayloads.push(payload);
        return 'new-access';
      },
      generateRefreshToken: () => 'new-refresh',
    },
    clock: () => new Date('2026-08-17T01:00:00.000Z'),
  });
  return { accessPayloads, calls, service };
};

test('refresh preserves QA scope and cannot outlive the QA session', async () => {
  const { accessPayloads, calls, service } = createHarness({
    user: {
      id: 77,
      role: 'USER',
      qa_session_id: 'qa-session',
      qa_expires_at: new Date('2026-08-17T09:00:00.000Z'),
    },
  });

  const result = await service.refresh('old-refresh', { ipAddress: '127.0.0.1', userAgent: 'test' });

  assert.deepEqual(result, { accessToken: 'new-access', refreshToken: 'new-refresh' });
  assert.deepEqual(accessPayloads, [{ userId: 77, role: 'USER', qaSessionId: 'qa-session' }]);
  assert.deepEqual(calls[0][1].expiresAt, new Date('2026-08-17T09:00:00.000Z'));
  assert.deepEqual(calls[0][1].absoluteExpiresAt, new Date('2026-08-17T09:00:00.000Z'));
});

test('refresh rejects an expired QA session and revokes its token family', async () => {
  const { calls, service } = createHarness({
    user: {
      id: 77,
      role: 'USER',
      qa_session_id: 'qa-session',
      qa_expires_at: new Date('2026-08-17T00:59:59.000Z'),
    },
  });

  await assert.rejects(
    service.refresh('old-refresh', {}),
    (error) => error.status === 401 && error.code === 'QA_SESSION_EXPIRED'
  );
  assert.deepEqual(calls, [['delete-family', 'family-id']]);
});

test('ordinary users retain the existing seven-day sliding refresh behavior', async () => {
  const { accessPayloads, calls, service } = createHarness({
    user: { id: 12, role: 'USER', qa_session_id: null, qa_expires_at: null },
  });

  await service.refresh('old-refresh', {});

  assert.deepEqual(accessPayloads, [{ userId: 12, role: 'USER' }]);
  assert.deepEqual(calls[0][1].expiresAt, new Date('2026-08-24T01:00:00.000Z'));
  assert.deepEqual(calls[0][1].absoluteExpiresAt, new Date('2026-11-01T00:00:00.000Z'));
});
