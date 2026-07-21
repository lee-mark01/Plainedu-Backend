// matching.calculator 단위 테스트 — 의존성 0 순수 함수만 검증, DB 불필요. `node --test tests/`로 실행.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { checkCrosses } = require('../src/domains/trading/matching.calculator');

test('BUY: 현재가가 지정가보다 낮으면 체결', () => {
  assert.equal(checkCrosses({ orderType: 'BUY', orderPrice: 100, currentPrice: 99 }), true);
});

test('BUY: 현재가가 지정가와 정확히 같으면 체결 (경계값)', () => {
  assert.equal(checkCrosses({ orderType: 'BUY', orderPrice: 100, currentPrice: 100 }), true);
});

test('BUY: 현재가가 지정가보다 높으면 미체결', () => {
  assert.equal(checkCrosses({ orderType: 'BUY', orderPrice: 100, currentPrice: 101 }), false);
});

test('SELL: 현재가가 지정가보다 높으면 체결', () => {
  assert.equal(checkCrosses({ orderType: 'SELL', orderPrice: 100, currentPrice: 101 }), true);
});

test('SELL: 현재가가 지정가와 정확히 같으면 체결 (경계값)', () => {
  assert.equal(checkCrosses({ orderType: 'SELL', orderPrice: 100, currentPrice: 100 }), true);
});

test('SELL: 현재가가 지정가보다 낮으면 미체결', () => {
  assert.equal(checkCrosses({ orderType: 'SELL', orderPrice: 100, currentPrice: 99 }), false);
});
