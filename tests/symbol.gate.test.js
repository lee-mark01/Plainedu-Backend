// 심볼 게이트 검증 — 외부 시세 API(TwelveData)로 요청이 나가기 전에 잘리는지.
//
// isValidSymbol을 직접 부르는 단위 검증이라 TwelveData를 절대 타지 않는다(크레딧 0).
// 엔드포인트 쪽은 "모르는 심볼이 404로 끝난다"만 확인한다 — 유효 심볼로 부르면 실제 API가
// 호출되므로 테스트에서 다루지 않는다.

const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');

require('dotenv').config({ quiet: true });
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret';
delete process.env.REALTIME_SYMBOLS; // core 목록을 코드 기본값(CORE_SYMBOLS)으로 고정

const app = require('../src/app');
const redis = require('../src/config/redis');
const pool = require('../src/config/db');
const { isValidSymbol } = require('../src/domains/stock/symbol');

let server;
let base;

test.before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  redis.disconnect();
  await pool.end().catch(() => {});
});

test('Stocks에 있는 ACTIVE 종목은 통과한다', async () => {
  assert.strictEqual(await isValidSymbol('AAPL'), true);
});

test('Stocks에 없는 심볼은 막힌다 — 크레딧 드레인의 입구', async () => {
  assert.strictEqual(await isValidSymbol('ZZZZZZ'), false);
  assert.strictEqual(await isValidSymbol('QQQQZZ9'), false);
});

test('크립토/외환 페어는 core 목록에 있을 때만 통과한다', async () => {
  // 페어는 Stocks 테이블에 행이 없어 DB로는 판별이 안 된다 → core 목록이 유일한 기준
  assert.strictEqual(await isValidSymbol('BTC/USD'), true);
  assert.strictEqual(await isValidSymbol('EUR/USD'), true);
  assert.strictEqual(await isValidSymbol('XYZ/USD'), false);
});

test('GET /api/stocks/:symbol/chart — 모르는 심볼은 404로 끝난다', async () => {
  const res = await fetch(`${base}/api/stocks/ZZZZZZ/chart?range=1D`);
  assert.strictEqual(res.status, 404);
});

test('GET /api/stocks/:symbol/quote — 모르는 심볼은 404로 끝난다', async () => {
  const res = await fetch(`${base}/api/stocks/ZZZZZZ/quote`);
  assert.strictEqual(res.status, 404);
});
