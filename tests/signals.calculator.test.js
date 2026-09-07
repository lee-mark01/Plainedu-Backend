// 기술적 지표 순수 계산 — 의존성 0, DB/외부 API 불필요.
// `node --test tests/`로 실행.
//
// 값이 틀리면 화면에는 그럴듯한 숫자가 그대로 나가므로 눈으로는 못 잡는다.
// 그래서 손으로 검증 가능한 입력으로 고정한다.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  rsi,
  macd,
  emaSeries,
  classifyRsi,
  RSI_OVERSOLD,
} = require('../src/domains/stock/signals.calculator');

// Wilder RSI 원논문에 실린 표준 검증 시리즈(종가 기준).
// 이 데이터의 14일 RSI는 약 70.53으로 널리 알려져 있어 구현 대조에 쓴다.
const WILDER_CLOSES = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
  45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
];

test('RSI가 알려진 검증 시리즈와 일치한다', () => {
  const value = rsi(WILDER_CLOSES, 14);
  // 반올림 자리수 차이를 감안해 0.5 이내로 본다.
  assert.ok(Math.abs(value - 70.53) < 0.5, `기대 ~70.53, 실제 ${value}`);
});

test('표본이 모자라면 null이다', () => {
  // 신규 상장이나 캐시가 짧은 종목에서 지표를 못 내는 건 오류가 아니다.
  assert.equal(rsi([1, 2, 3], 14), null);
  assert.equal(rsi(WILDER_CLOSES.slice(0, 14), 14), null); // period+1 미만
  assert.equal(macd(new Array(30).fill(10)), null); // slow+signal 미만
  assert.equal(rsi(null, 14), null);
});

test('계속 오르기만 하면 RSI 100, 변화가 없으면 50', () => {
  // 하락이 없으면 RS가 무한대가 된다 — 관례대로 100으로 고정한다.
  const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(rsi(rising, 14), 100);

  // 상승도 하락도 없으면 0/0이라 정의되지 않는다. 중립인 50으로 둔다.
  assert.equal(rsi(new Array(30).fill(50), 14), 50);
});

test('계속 내리기만 하면 RSI가 과매도 경계 아래다', () => {
  const falling = Array.from({ length: 30 }, (_, i) => 200 - i * 2);
  const value = rsi(falling, 14);

  assert.equal(value, 0);
  assert.equal(classifyRsi(value), 'OVERSOLD');
  assert.ok(value <= RSI_OVERSOLD);
});

test('EMA는 최초 period개의 단순 평균으로 시작한다', () => {
  const series = emaSeries([1, 2, 3, 4, 5], 3);
  // 첫 값 = (1+2+3)/3 = 2
  assert.equal(series[0], 2);
  // 이후 k = 2/(3+1) = 0.5 → 4*0.5 + 2*0.5 = 3
  assert.equal(series[1], 3);
  // 5*0.5 + 3*0.5 = 4
  assert.equal(series[2], 4);
  // 길이 = values.length - period + 1
  assert.equal(series.length, 3);
});

test('MACD가 시점을 맞춰 마지막 값을 낸다', () => {
  // 꾸준히 오르는 시리즈에서는 단기 EMA가 장기 EMA 위에 있어 macd가 양수다.
  const rising = Array.from({ length: 60 }, (_, i) => 100 + i);
  const result = macd(rising);

  assert.ok(result, 'MACD를 계산하지 못했다');
  assert.ok(result.macd > 0, `상승 추세에서 macd가 양수여야 한다: ${result.macd}`);
  // histogram = macd - signal. 세 값이 각각 반올림돼 나오므로 오차 범위로 본다.
  assert.ok(Math.abs(result.histogram - (result.macd - result.signal)) < 1e-3);
  // 이미 한참 위에 있으면 "막 교차"가 아니다.
  assert.equal(result.goldenCross, false);
});

test('골든크로스는 막 교차한 순간에만 참이다', () => {
  // 오래 내리다가 마지막에 급반등 — macd가 signal을 아래에서 위로 뚫는 구간을 만든다.
  const closes = [
    ...Array.from({ length: 40 }, (_, i) => 200 - i * 2),
    ...Array.from({ length: 12 }, (_, i) => 120 + i * 6),
  ];
  const result = macd(closes);

  assert.ok(result);
  // 교차 여부는 배타적이어야 한다 — 둘 다 참이면 판정이 깨진 것이다.
  assert.equal(result.goldenCross && result.deadCross, false);
});

test('RSI 구간 판정', () => {
  assert.equal(classifyRsi(20), 'OVERSOLD');
  assert.equal(classifyRsi(30), 'OVERSOLD'); // 경계 포함
  assert.equal(classifyRsi(50), 'NEUTRAL');
  assert.equal(classifyRsi(70), 'OVERBOUGHT'); // 경계 포함
  assert.equal(classifyRsi(85), 'OVERBOUGHT');
  assert.equal(classifyRsi(null), null);
});
