// 동의 상태 저장/조회 - DB 불필요(순수 매핑 + Joi 스키마 검증).
//
// 두 가지가 조용히 깨지기 쉬워 못 박는다:
//   1) 행이 없는 항목이 undefined로 새면 프론트 온보딩 분기가 갈린다 -> 항상 false여야 한다
//   2) 필수 동의(TERMS/PRIVACY)에 false가 통과하면 "가입됐는데 미동의" 상태가 생긴다
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { toResponse } = require('../src/domains/user/agreement.service');
const { agreementsSchema } = require('../src/domains/user/agreement.validator');

test('동의 이력이 없으면 세 항목 모두 false', () => {
  assert.deepEqual(toResponse([]), { terms: false, privacy: false, marketing: false });
});

test('저장된 항목만 true, 나머지는 false로 채워진다', () => {
  const rows = [
    { type: 'TERMS', is_agreed: 1 },
    { type: 'PRIVACY', is_agreed: 1 },
  ];
  assert.deepEqual(toResponse(rows), { terms: true, privacy: true, marketing: false });
});

test('철회된 행(is_agreed=0)은 false로 읽힌다', () => {
  const rows = [
    { type: 'TERMS', is_agreed: 1 },
    { type: 'MARKETING', is_agreed: 0 },
  ];
  assert.deepEqual(toResponse(rows), { terms: true, privacy: false, marketing: false });
});

test('필수 동의는 true만 허용 - false는 거부한다', () => {
  const { error } = agreementsSchema.validate({ terms: false });
  assert.ok(error, 'terms:false가 통과하면 안 된다');
  assert.match(error.message, /철회할 수 없습니다/);
});

test('마케팅은 false로 철회할 수 있다', () => {
  const { error, value } = agreementsSchema.validate({ marketing: false });
  assert.equal(error, undefined);
  assert.equal(value.marketing, false);
});

test('빈 body는 거부한다', () => {
  const { error } = agreementsSchema.validate({});
  assert.ok(error);
  assert.match(error.message, /하나 이상/);
});

test('온보딩 필수 2종 동의 제출은 통과한다', () => {
  const { error } = agreementsSchema.validate({ terms: true, privacy: true, marketing: false });
  assert.equal(error, undefined);
});
