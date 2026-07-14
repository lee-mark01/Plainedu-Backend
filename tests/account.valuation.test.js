// account.valuation.calculator 단위 테스트 (스펙: docs/specs/spec-account-valuation.md §4.1·§7)
// 의존성 0 순수 함수만 검증 — DB/Redis 불필요, `node --test tests/` 로 실행
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildValuation } = require('../src/domains/account/account.valuation.calculator');

test('보유 0건: 총자산=현금, cash_weight 100, 수익률은 현금 기준', () => {
  const r = buildValuation({
    initial_cash: 10000,
    cash_balance: 10000,
    holdings: [],
    priceMap: {},
  });
  assert.equal(r.total_equity, 10000);
  assert.equal(r.cash_balance, 10000);
  assert.equal(r.cash_weight, 100);
  assert.equal(r.return_rate, 0);
  assert.deepEqual(r.holdings, []);
  assert.equal(r.has_stale_prices, false);
  assert.deepEqual(r.stale_symbols, []);
});

test('정상 보유 1종목: value/pnl/pnl_rate/weight/return_rate 산식 (D1·D7 반올림)', () => {
  const r = buildValuation({
    initial_cash: 10000,
    cash_balance: 5000,
    holdings: [{ stock_code: 'AAPL', quantity: 10, average_buy_price: 210 }],
    priceMap: { AAPL: 215.3 },
  });
  const h = r.holdings[0];
  assert.equal(h.current_price, 215.3);
  assert.equal(h.price_stale, false);
  assert.equal(h.value, 2153); // 215.3 × 10
  assert.equal(h.pnl, 53); // (215.3 − 210) × 10
  assert.equal(h.pnl_rate, 2.5238); // 53 / 2100 × 100, 소수 4자리
  assert.equal(r.total_equity, 7153);
  assert.equal(h.weight, 30.0993); // 2153 / 7153 × 100
  assert.equal(r.cash_weight, 69.9007);
  assert.equal(r.return_rate, -28.47); // (7153 − 10000) / 10000 × 100 = -28.4700
  assert.equal(r.has_stale_prices, false);
});

test('weight 합계 = 100 (±반올림 오차)', () => {
  const r = buildValuation({
    initial_cash: 10000,
    cash_balance: 3333.33,
    holdings: [
      { stock_code: 'AAPL', quantity: 3, average_buy_price: 100 },
      { stock_code: 'TSLA', quantity: 7, average_buy_price: 200 },
    ],
    priceMap: { AAPL: 111.11, TSLA: 222.22 },
  });
  const sum = r.cash_weight + r.holdings.reduce((s, h) => s + h.weight, 0);
  assert.ok(Math.abs(sum - 100) < 0.001, `weight 합계 ${sum}`);
});

test('가격 누락(D4 단건): 평단가 대체 + price_stale + stale_symbols 집계', () => {
  const r = buildValuation({
    initial_cash: 10000,
    cash_balance: 1000,
    holdings: [
      { stock_code: 'AAPL', quantity: 10, average_buy_price: 210 },
      { stock_code: 'NVDA', quantity: 2, average_buy_price: 500 },
    ],
    priceMap: { AAPL: 215.3, NVDA: null }, // NVDA 가격 조회 실패
  });
  const nvda = r.holdings.find((h) => h.stock_code === 'NVDA');
  assert.equal(nvda.price_stale, true);
  assert.equal(nvda.current_price, 500); // 평단가 대체
  assert.equal(nvda.value, 1000);
  assert.equal(nvda.pnl, 0); // 평단가 평가라 손익 0
  assert.equal(r.has_stale_prices, true);
  assert.deepEqual(r.stale_symbols, ['NVDA']);
  // 나머지 종목은 정상 평가
  assert.equal(r.holdings.find((h) => h.stock_code === 'AAPL').price_stale, false);
});

test('priceMap에 심볼 자체가 없어도 가격 누락으로 처리', () => {
  const r = buildValuation({
    initial_cash: 10000,
    cash_balance: 0,
    holdings: [{ stock_code: 'MSFT', quantity: 1, average_buy_price: 400 }],
    priceMap: {},
  });
  assert.equal(r.holdings[0].price_stale, true);
  assert.equal(r.holdings[0].current_price, 400);
  assert.deepEqual(r.stale_symbols, ['MSFT']);
});

test('initial_cash ≤ 0 방어: return_rate null', () => {
  const r = buildValuation({ initial_cash: 0, cash_balance: 5000, holdings: [], priceMap: {} });
  assert.equal(r.return_rate, null);
  assert.equal(r.total_equity, 5000);
});

test('total_equity ≤ 0 방어: weight 전부 null', () => {
  const r = buildValuation({ initial_cash: 10000, cash_balance: 0, holdings: [], priceMap: {} });
  assert.equal(r.total_equity, 0);
  assert.equal(r.cash_weight, null);
  assert.equal(r.return_rate, -100);
});

test('DB DECIMAL 문자열 입력 허용 (mysql2 기본 반환형)', () => {
  const r = buildValuation({
    initial_cash: '10000.00',
    cash_balance: '5000.00',
    holdings: [{ stock_code: 'AAPL', quantity: '10.0000', average_buy_price: '210.00' }],
    priceMap: { AAPL: 215.3 },
  });
  assert.equal(r.total_equity, 7153);
  assert.equal(r.holdings[0].pnl, 53);
});

test('금액 소수 2자리·비율 소수 4자리 반올림 (D7)', () => {
  const r = buildValuation({
    initial_cash: 3000,
    cash_balance: 1000.005, // → 1000.01 (금액 2자리)
    holdings: [{ stock_code: 'AAPL', quantity: 3, average_buy_price: 100.111 }],
    priceMap: { AAPL: 100.119 },
  });
  assert.equal(r.cash_balance, 1000.01);
  const h = r.holdings[0];
  assert.equal(h.value, 300.36); // 100.119 × 3 = 300.357 → 300.36
  assert.equal(h.pnl, 0.02); // (100.119 − 100.111) × 3 = 0.024 → 0.02
  // 비율류는 소수 4자리 이하인지 확인
  for (const v of [h.pnl_rate, h.weight, r.cash_weight, r.return_rate]) {
    assert.equal(v, Math.round(v * 10000) / 10000);
  }
});
