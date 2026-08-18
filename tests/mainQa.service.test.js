const test = require('node:test');
const assert = require('node:assert/strict');

const { createMainQaService } = require('../src/domains/mainQa/mainQa.service');

const createHarness = ({ enabled = true, pinValid = true, user = { id: 91, email: 'dummy.leader@test.com', nickname: '더미팀장', role: 'USER' } } = {}) => {
  const calls = [];
  const repository = {
    findUserByEmail: async (email) => {
      calls.push(['findUser', email]);
      return user;
    },
    saveRefreshToken: async (value) => calls.push(['saveRefresh', value]),
  };
  const tokenTools = {
    signAccessToken: (payload) => {
      calls.push(['access', payload]);
      return 'access-token';
    },
    generateRefreshToken: () => 'refresh-token',
    hashToken: (value) => `hashed:${value}`,
  };
  const service = createMainQaService({
    config: { enabled, pinHash: 'stored-pin', userEmail: 'dummy.leader@test.com', sessionTtlHours: 8 },
    verifyPin: async () => pinValid,
    repository,
    tokenTools,
    randomUUID: () => 'family-id',
    clock: () => new Date('2026-08-18T00:00:00.000Z'),
  });
  return { calls, service };
};

test('메인 QA 로그인이 비활성화되면 존재를 노출하지 않는다', async () => {
  const { service } = createHarness({ enabled: false });
  await assert.rejects(service.login('123456', {}), (error) => error.status === 404 && error.code === 'QA_AUTH_DISABLED');
});

test('잘못된 QA PIN은 사용자 조회 전에 거부한다', async () => {
  const { calls, service } = createHarness({ pinValid: false });
  await assert.rejects(service.login('000000', {}), (error) => error.status === 401 && error.code === 'QA_PIN_INVALID');
  assert.deepEqual(calls, []);
});

test('시드된 QA 전용 계정만 접근 및 리프레시 토큰을 발급한다', async () => {
  const { calls, service } = createHarness();
  const result = await service.login('123456', { ipAddress: '203.0.113.7', userAgent: 'qa-app' });

  assert.equal(result.accessToken, 'access-token');
  assert.equal(result.refreshToken, 'refresh-token');
  assert.equal(result.user.email, 'dummy.leader@test.com');
  assert.deepEqual(calls[0], ['findUser', 'dummy.leader@test.com']);
  assert.deepEqual(calls[1], ['access', { userId: 91, role: 'USER' }]);
  assert.equal(calls[2][0], 'saveRefresh');
  assert.equal(calls[2][1].userId, 91);
  assert.equal(calls[2][1].tokenHash, 'hashed:refresh-token');
  assert.equal(calls[2][1].familyId, 'family-id');
  assert.equal(calls[2][1].absoluteExpiresAt.toISOString(), '2026-08-18T08:00:00.000Z');
});

test('QA 전용 계정이 시드되지 않았으면 토큰을 발급하지 않는다', async () => {
  const { service } = createHarness({ user: null });
  await assert.rejects(service.login('123456', {}), (error) => error.status === 503 && error.code === 'QA_DATA_NOT_READY');
});
