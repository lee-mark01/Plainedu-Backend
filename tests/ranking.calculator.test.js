// ranking.calculator 단위 테스트
// 의존성 0 순수 함수만 검증 — DB/Redis 불필요, `node --test tests/` 로 실행
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  personalScore,
  participationRatio,
  teamScore,
  orgWeightedScore,
} = require('../src/domains/ranking/ranking.calculator');

test('기본 산식: (Vt − V0) / V0 × 100', () => {
  assert.equal(personalScore(11000, 10000), 10);
  assert.equal(personalScore(9500, 10000), -5);
  assert.equal(personalScore(10000, 10000), 0);
});

test('계좌 0원 = 산식 그대로 −100% (0%=특례 폐기, 스펙 §3)', () => {
  assert.equal(personalScore(0, 10000), -100);
});

test('V0 ≤ 0 은 null (집계 제외 방어)', () => {
  assert.equal(personalScore(5000, 0), null);
  assert.equal(personalScore(5000, -1), null);
});

test('DECIMAL 문자열 입력 허용 (mysql2 DECIMAL은 문자열로 온다)', () => {
  assert.equal(personalScore('10250.50', '10000.00'), 2.505);
});

test('소수 4자리 반올림 + 부동소수 오차 보정', () => {
  assert.equal(personalScore(10333.333, 10000), 3.3333); // 3.33333 → 4자리
  assert.equal(personalScore(1000.005, 1000), 0.0005); // 1000.005/1000 부동소수 케이스
});

test('participationRatio: ActiveDays / SeasonDays (0~1 비율)', () => {
  assert.equal(participationRatio(30, 90), 0.3333);
  assert.equal(participationRatio(0, 90), 0);
  assert.equal(participationRatio(90, 90), 1);
});

test('participationRatio: SeasonDays ≤ 0 은 null (집계 제외 방어)', () => {
  assert.equal(participationRatio(10, 0), null);
  assert.equal(participationRatio(10, -1), null);
});

test('teamScore: (R% × 0.9) + (Alignment × 0.1), 소수 1자리', () => {
  assert.equal(teamScore(0, 100), 10); // 시즌 초 현금 100% 팀: 0×0.9 + 100×0.1
  assert.equal(teamScore(10, 100), 19);
  assert.equal(teamScore(-5.5, 80), 3.1); // -4.95 + 8 = 3.05 → 반올림 3.1
  assert.equal(teamScore('2.3450', '100'), 12.1); // DECIMAL 문자열 허용: 2.1105 + 10 = 12.1105 → 12.1
});

test('teamScore: 입력 결측(null)은 null (집계 제외 방어)', () => {
  assert.equal(teamScore(null, 100), null);
  assert.equal(teamScore(5, null), null);
});

test('orgWeightedScore: Σ(score×ratio)/Σ(ratio) 가중평균', () => {
  // (10×0.5 + 4×1.0) / (0.5+1.0) = 9/1.5 = 6
  assert.equal(orgWeightedScore([{ score: 10, ratio: 0.5 }, { score: 4, ratio: 1 }]), 6);
  // 참여율이 높은 쪽으로 가중 — 단순평균(7)과 다름을 확인
  assert.notEqual(orgWeightedScore([{ score: 10, ratio: 0.5 }, { score: 4, ratio: 1 }]), 7);
});

test('orgWeightedScore: 팀 소속(ratio=1 고정)은 단순평균', () => {
  // (10 + 20 + 30)/3 = 20, Point 1자리
  assert.equal(orgWeightedScore([{ score: 10, ratio: 1 }, { score: 20, ratio: 1 }, { score: 30, ratio: 1 }], 1), 20);
});

test('orgWeightedScore: Σ(ratio)=0 은 null (분모 0 학교 제외)', () => {
  // 전원 출석 0 → 참여율 0 → 분모 0
  assert.equal(orgWeightedScore([{ score: 10, ratio: 0 }, { score: -5, ratio: 0 }]), null);
  assert.equal(orgWeightedScore([]), null);
});

test('orgWeightedScore: digits로 단위 반올림 (개인 % 4자리 / 팀 Point 1자리)', () => {
  // (2.3456×0.3333) / 0.3333 = 2.3456 → 4자리 유지
  assert.equal(orgWeightedScore([{ score: 2.3456, ratio: 0.3333 }], 4), 2.3456);
  // 15.55 → 1자리 반올림 15.6
  assert.equal(orgWeightedScore([{ score: 15.55, ratio: 1 }], 1), 15.6);
});
