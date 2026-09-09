const test = require('node:test');
const assert = require('node:assert/strict');

const { createMainQaService } = require('../src/domains/mainQa/mainQa.service');
const { QA_PERSONAS, QA_PERSONA_KEYS, DEFAULT_PERSONA } = require('../src/domains/mainQa/mainQa.config');
const { mainQaLoginSchema } = require('../src/domains/mainQa/mainQa.validator');

const createHarness = ({ enabled = true, pinValid = true, user = { id: 91, nickname: '더미팀장', role: 'USER' } } = {}) => {
  const calls = [];
  const repository = {
    // 요청한 이메일을 그대로 붙여 돌려준다 — persona가 어느 계정을 골랐는지 응답에서 확인할 수 있게.
    findUserByEmail: async (email) => {
      calls.push(['findUser', email]);
      return user && { ...user, email };
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
    config: {
      enabled,
      pinHash: 'stored-pin',
      userEmail: QA_PERSONAS[DEFAULT_PERSONA],
      personas: QA_PERSONAS,
      sessionTtlHours: 8,
    },
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

test('persona를 생략하면 기존과 같은 기본 계정으로 로그인한다', async () => {
  // 기존 계약이다 — 프론트가 이미 pin만 보내고 있으므로 깨지면 안 된다.
  const { calls, service } = createHarness();
  await service.login('123456', {});
  assert.deepEqual(calls[0], ['findUser', QA_PERSONAS[DEFAULT_PERSONA]]);
});

test('persona가 가리키는 시드 계정으로 로그인한다', async () => {
  for (const key of QA_PERSONA_KEYS) {
    const { calls, service } = createHarness();
    const result = await service.login('123456', { persona: key });
    assert.deepEqual(calls[0], ['findUser', QA_PERSONAS[key]], `${key}가 다른 계정을 골랐다`);
    assert.equal(result.user.email, QA_PERSONAS[key]);
  }
});

test('화이트리스트 밖의 persona는 계정을 조회하지 않고 거부한다', async () => {
  // PIN이 유출돼도 임의 이메일로는 로그인할 수 없어야 한다 — 이게 그 보증이다.
  const { calls, service } = createHarness();
  for (const persona of ['admin@evil.com', 'root', 'dummy.leader@test.com']) {
    await assert.rejects(
      service.login('123456', { persona }),
      (error) => error.status === 400 && error.code === 'QA_PERSONA_UNKNOWN',
      `${persona}가 통과했다`
    );
  }
  assert.deepEqual(calls, [], '거부 전에 DB를 조회했다');
});

test('토큰의 role은 상수가 아니라 DB 값을 따른다', async () => {
  // 관리자 계정을 시드로 만드는 근거다 — role을 여기서 정하면 시드와 어긋난다.
  const { calls, service } = createHarness({ user: { id: 99, nickname: '더미관리자', role: 'ADMIN' } });
  await service.login('123456', { persona: 'admin' });
  assert.deepEqual(calls[1], ['access', { userId: 99, role: 'ADMIN' }]);
});

test('Joi가 알 수 없는 persona를 400으로 막는다', () => {
  assert.equal(mainQaLoginSchema.validate({ pin: '123456' }).error, undefined);
  for (const key of QA_PERSONA_KEYS) {
    assert.equal(mainQaLoginSchema.validate({ pin: '123456', persona: key }).error, undefined, `${key} 거부됨`);
  }
  // 이메일을 직접 받지 않는다 — 받는 값이 미리 정해진 키뿐이면 임의 계정 로그인이 표현 불가능하다.
  for (const bad of ['dummy.leader@test.com', 'LEADER', 'owner', '']) {
    assert.ok(mainQaLoginSchema.validate({ pin: '123456', persona: bad }).error, `${bad}가 통과했다`);
  }
});
