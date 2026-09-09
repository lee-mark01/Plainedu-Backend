// 휴대폰 인증 - 번호 정규화와 코드 검증 규칙. DB/Redis/SMS 모두 타지 않는 순수 검증.
//
// 정규화가 깨지면 "010-1234-5678"과 "01012345678"이 다른 번호로 취급돼
// 발송한 Redis 키와 검증하는 키가 어긋난다. 증상이 "인증번호가 만료되었습니다"로만 보여서
// 원인 찾기가 고약하다.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  sendPhoneCodeSchema,
  verifyPhoneCodeSchema,
  normalizePhone,
} = require('../src/domains/auth/phoneVerification.validator');

test('하이픈·공백이 섞여도 숫자만 남긴다', () => {
  assert.equal(normalizePhone('010-1234-5678'), '01012345678');
  assert.equal(normalizePhone('010 1234 5678'), '01012345678');
  assert.equal(normalizePhone('01012345678'), '01012345678');
});

test('표기가 달라도 검증 후 같은 값이 된다 (Redis 키 일치 보장)', () => {
  const a = sendPhoneCodeSchema.validate({ phone: '010-1234-5678' });
  const b = sendPhoneCodeSchema.validate({ phone: '01012345678' });
  assert.equal(a.error, undefined);
  assert.equal(b.error, undefined);
  assert.equal(a.value.phone, b.value.phone);
});

test('휴대폰이 아닌 번호는 거부한다', () => {
  for (const phone of ['0212345678', '01212345678', '010123456789', '0101234', 'abc', '']) {
    assert.ok(sendPhoneCodeSchema.validate({ phone }).error, `${phone} 이 통과하면 안 된다`);
  }
});

test('011/016/017/018/019 구형 번호도 허용한다', () => {
  for (const phone of ['0111234567', '01612345678', '0171234567']) {
    assert.equal(sendPhoneCodeSchema.validate({ phone }).error, undefined, phone);
  }
});

test('인증번호는 숫자 6자리만 통과한다', () => {
  const base = { phone: '01012345678' };
  assert.equal(verifyPhoneCodeSchema.validate({ ...base, code: '123456' }).error, undefined);
  for (const code of ['12345', '1234567', '12345a', '']) {
    assert.ok(verifyPhoneCodeSchema.validate({ ...base, code }).error, `${code} 가 통과하면 안 된다`);
  }
});

test('code 없이 verify는 거부한다', () => {
  assert.ok(verifyPhoneCodeSchema.validate({ phone: '01012345678' }).error);
});
