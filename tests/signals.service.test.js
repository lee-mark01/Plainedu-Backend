// 투자 신호 구성 — 의존성 0, DB/Redis 불필요.
// `node --test tests/`로 실행.
//
// buildSignals는 계산 결과를 화면용 목록으로 바꾸는 순수 함수라 DB 없이 검증할 수 있다.
// 지표 계산 자체는 tests/signals.calculator.test.js가 맡는다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const { buildSignals, POPULAR_COUNT } = require('../src/domains/stock/signals.service');

const analyzed = (over = {}) => ({
  stock_code: 'AAPL',
  name: 'Apple Inc',
  popularity: 0,
  rsi: 50,
  macd: { macd: 1, signal: 0.5, histogram: 0.5, goldenCross: false, deadCross: false },
  based_on: '2026-09-05 00:00:00',
  ...over,
});

test('과매도와 골든크로스를 각각 신호로 낸다', () => {
  const signals = buildSignals([
    analyzed({ stock_code: 'AAPL', rsi: 22 }),
    analyzed({ stock_code: 'MSFT', macd: { histogram: 0.2, goldenCross: true } }),
  ]);

  const types = signals.map((s) => `${s.type}:${s.stock_code}`);
  assert.ok(types.includes('RSI_OVERSOLD:AAPL'));
  assert.ok(types.includes('MACD_GOLDEN_CROSS:MSFT'));
});

test('중립 구간과 비교차는 신호를 만들지 않는다', () => {
  // 신호가 아닌 것까지 내보내면 목록이 전 종목이 되어 "신호"의 의미가 사라진다.
  const signals = buildSignals([analyzed({ rsi: 55 })]);
  assert.deepEqual(signals, []);
});

test('과매수는 과매도 신호로 잡히지 않는다', () => {
  const signals = buildSignals([analyzed({ rsi: 85 })]);
  assert.equal(signals.filter((s) => s.type === 'RSI_OVERSOLD').length, 0);
});

test('지표를 못 낸 종목은 건너뛴다', () => {
  // 신규 상장이나 캐시가 짧은 종목은 rsi/macd가 null이다. 오류가 아니라 판단 불가다.
  const signals = buildSignals([analyzed({ rsi: null, macd: null })]);
  assert.deepEqual(signals, []);
});

test('인기 종목은 상위 몇 개만, 인기도 0은 제외', () => {
  const many = Array.from({ length: POPULAR_COUNT + 3 }, (_, i) =>
    analyzed({ stock_code: `S${i}`, popularity: 10 - i })
  );
  // 아무도 안 본 종목은 "인기"가 아니다.
  many.push(analyzed({ stock_code: 'ZERO', popularity: 0 }));

  const popular = buildSignals(many).filter((s) => s.type === 'POPULAR');

  assert.equal(popular.length, POPULAR_COUNT);
  assert.equal(popular.some((s) => s.stock_code === 'ZERO'), false);
});

test('모든 신호가 기준 시각과 출처를 갖는다', () => {
  // 요청 16의 핵심 요구 — 없으면 오래된 데이터를 최신처럼 보여주게 된다.
  const signals = buildSignals([
    analyzed({ rsi: 20, popularity: 5, macd: { histogram: 0.1, goldenCross: true } }),
  ]);

  assert.ok(signals.length >= 3);
  for (const s of signals) {
    assert.ok(s.based_on, `${s.type}에 based_on이 없다`);
    assert.ok(['daily_candles', 'community'].includes(s.source), `${s.type}의 source가 이상하다`);
  }

  // 인기 종목은 시장 지표가 아니라 우리 사용자 기준이라 출처가 다르다.
  assert.equal(signals.find((s) => s.type === 'POPULAR').source, 'community');
  assert.equal(signals.find((s) => s.type === 'RSI_OVERSOLD').source, 'daily_candles');
});

test('신호 조회가 캐시되고 순차로 계산된다', () => {
  const source = read('src/domains/stock/signals.service.js');

  // 지표는 일봉 기준이라 요청마다 재계산할 이유가 없다.
  assert.match(source, /CACHE_TTL_SECONDS/);
  // 동시에 쏘면 외부 API 분당 한도에 걸려 전부 실패할 수 있다.
  assert.match(source, /for \(const stock of universe\)/);
  assert.doesNotMatch(source, /Promise\.all\(universe/);
});

test('신호 경로가 :symbol보다 먼저 선언되고 공개다', () => {
  const router = read('src/domains/stock/stock.router.js');

  assert.ok(router.indexOf("'/signals'") < router.indexOf("'/:symbol/quote'"));
  // 신호는 사용자별로 달라지지 않고 투자 홈 첫 화면에 필요하다.
  assert.doesNotMatch(router, /router\.get\('\/signals', authenticate/);
});

test('OpenAPI가 신호 계약을 문서화한다', () => {
  const spec = yaml.load(read('docs/openapi.yaml'));
  assert.ok(spec.paths['/api/stocks/signals']?.get);

  const props = spec.paths['/api/stocks/signals'].get.responses['200']
    .content['application/json'].schema.allOf[1].properties.data.properties;

  // 신호 종류와 출처는 프론트가 화면을 나누는 근거라 값 집합이 계약이다.
  assert.deepEqual(props.signals.items.properties.type.enum, [
    'POPULAR', 'RSI_OVERSOLD', 'MACD_GOLDEN_CROSS',
  ]);
  assert.deepEqual(props.signals.items.properties.source.enum, ['daily_candles', 'community']);
  assert.ok(props.as_of, '계산 시각이 문서에 없다');
  assert.ok(props.signals.items.properties.based_on, '봉 기준 시각이 문서에 없다');
});
