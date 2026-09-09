// 휴대폰 인증 흐름 - Redis/SMS/DB를 전부 대역으로 바꿔 로직만 본다.
// 실제 문자가 나가면 테스트마다 요금이 발생하고, Redis 유무에 따라 결과가 갈리면 CI가 흔들린다.
//
// 여기서 지키려는 계약:
//   - 쿨다운이 중복 발송을 막는다 (레이트리밋은 연타를 못 막는다)
//   - 중복 번호는 문자를 보내기 "전에" 걸러진다 (보내고 거절하면 비용만 나간다)
//   - 발송이 실패하면 코드와 쿨다운을 남기지 않는다 (못 받은 사람이 잠기면 안 된다)
const { test, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');

const redis = require('../src/config/redis');
const solapi = require('../src/config/solapi');
const userRepository = require('../src/domains/user/user.repository');
const service = require('../src/domains/auth/phoneVerification.service');
const pool = require('../src/config/db');

// 모든 호출을 대역으로 막아도 클라이언트 자체는 백그라운드 재연결을 계속한다 -
// 끊지 않으면 테스트가 끝나도 프로세스가 살아 있다.
after(() => {
  redis.disconnect();
  return pool.end().catch(() => {});
});

const USER = 1;
const PHONE = '01012345678';

let store, sent;

// TTL은 저장만 하고 흐르지 않는다 - 만료는 키를 지워서 표현한다.
const fakeRedis = () => {
  store = new Map();
  mock.method(redis, 'set', async (k, v, _ex, ttl) => { store.set(k, { v, ttl }); return 'OK'; });
  mock.method(redis, 'get', async (k) => (store.has(k) ? store.get(k).v : null));
  mock.method(redis, 'del', async (k) => { store.delete(k); return 1; });
  mock.method(redis, 'ttl', async (k) => (store.has(k) ? store.get(k).ttl : -2));
};

beforeEach(() => {
  mock.restoreAll();
  fakeRedis();
  sent = [];
  mock.method(solapi, 'sendSms', async (to, text) => { sent.push({ to, text }); return { statusCode: '2000' }; });
  mock.method(userRepository, 'findVerifiedByPhone', async () => null);
  mock.method(userRepository, 'updatePhoneVerified', async () => {});
});

test('발송: 코드를 저장하고 SMS 1건을 보낸다', async () => {
  const r = await service.sendVerificationCode(USER, PHONE);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, PHONE);
  assert.match(sent[0].text, /인증번호 \d{6}/);
  assert.equal(r.cooldown_seconds, 30);
  assert.equal(r.expires_in_seconds, 180);
  assert.ok(store.has(`phone_verify:${PHONE}`), '코드가 저장돼야 한다');
});

test('쿨다운: 연속 발송은 429 RESEND_COOLDOWN + 남은 초', async () => {
  await service.sendVerificationCode(USER, PHONE);
  await assert.rejects(
    () => service.sendVerificationCode(USER, PHONE),
    (err) => {
      assert.equal(err.status, 429);
      assert.equal(err.code, 'RESEND_COOLDOWN');
      assert.match(err.message, /\d+초 후에/);
      return true;
    }
  );
  assert.equal(sent.length, 1, '두 번째는 문자가 나가면 안 된다');
});

test('중복 번호: 문자를 보내기 전에 409로 막는다', async () => {
  mock.method(userRepository, 'findVerifiedByPhone', async () => ({ id: 999 }));
  await assert.rejects(
    () => service.sendVerificationCode(USER, PHONE),
    (err) => err.status === 409 && err.code === 'PHONE_ALREADY_USED'
  );
  assert.equal(sent.length, 0, '비용이 나가면 안 된다');
});

test('본인이 이미 인증한 번호는 재발송을 허용한다', async () => {
  mock.method(userRepository, 'findVerifiedByPhone', async () => ({ id: USER }));
  await service.sendVerificationCode(USER, PHONE);
  assert.equal(sent.length, 1);
});

test('발송 실패: 코드도 쿨다운도 남기지 않는다', async () => {
  mock.method(solapi, 'sendSms', async () => { throw new Error('잔액 부족'); });
  await assert.rejects(
    () => service.sendVerificationCode(USER, PHONE),
    (err) => err.status === 502 && err.code === 'SMS_SEND_FAILED'
  );
  assert.equal(store.has(`phone_verify:${PHONE}`), false, '코드가 남으면 안 된다');
  assert.equal(store.has(`phone_resend:${PHONE}`), false, '못 받은 사람이 30초 잠기면 안 된다');
});

test('검증: 코드가 맞으면 저장하고 코드를 폐기한다', async () => {
  let saved = null;
  mock.method(userRepository, 'updatePhoneVerified', async (id, phone) => { saved = { id, phone }; });
  await service.sendVerificationCode(USER, PHONE);
  const code = store.get(`phone_verify:${PHONE}`).v;

  await service.verifyCode(USER, PHONE, code);
  assert.deepEqual(saved, { id: USER, phone: PHONE });
  assert.equal(store.has(`phone_verify:${PHONE}`), false, '재사용 못 하게 지워야 한다');
});

test('검증: 코드 불일치는 400 CODE_MISMATCH (코드는 유지)', async () => {
  await service.sendVerificationCode(USER, PHONE);
  await assert.rejects(
    () => service.verifyCode(USER, PHONE, '000000'),
    (err) => err.status === 400 && err.code === 'CODE_MISMATCH'
  );
  assert.ok(store.has(`phone_verify:${PHONE}`), '오타 한 번에 코드가 날아가면 안 된다');
});

test('검증: 코드 없음/만료는 400 CODE_EXPIRED', async () => {
  await assert.rejects(
    () => service.verifyCode(USER, PHONE, '123456'),
    (err) => err.status === 400 && err.code === 'CODE_EXPIRED'
  );
});

test('검증 직전에 다른 계정이 선점했으면 409', async () => {
  await service.sendVerificationCode(USER, PHONE);
  const code = store.get(`phone_verify:${PHONE}`).v;
  mock.method(userRepository, 'findVerifiedByPhone', async () => ({ id: 999 }));
  await assert.rejects(
    () => service.verifyCode(USER, PHONE, code),
    (err) => err.status === 409 && err.code === 'PHONE_ALREADY_USED'
  );
});
