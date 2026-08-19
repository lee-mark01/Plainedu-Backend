// 코어 종목 최소 시딩 — 외부 API를 타지 않는다.
//
// 사용법:
//   npm run seed:stocks:core
//
// seed-stocks.js는 Twelve Data에서 NASDAQ·NYSE 전 종목을 받아오므로 API 키가 필요하고
// 크레딧을 소모한다. CI나 TWELVEDATA_API_KEY가 없는 로컬에서는 그걸 쓸 수 없어서,
// 테스트가 실제로 요구하는 코어 종목만 여기서 직접 넣는다.
//
// 목록은 CORE_SYMBOLS에서 파생시킨다 — 코어가 늘어나면 이 시드도 자동으로 따라간다.
// 페어(BTC/USD 등)는 Stocks에 행이 없고 코어 목록으로만 판별되므로 제외한다(symbol.js 참조).
require('dotenv').config();

const pool = require('../../src/config/db');
const { CORE_SYMBOLS } = require('../../src/config/realtimeSymbols');

const NAMES = { AAPL: 'Apple Inc' };

(async () => {
  try {
    const codes = CORE_SYMBOLS.filter((s) => !s.includes('/'));

    for (const code of codes) {
      await pool.query(
        `INSERT INTO Stocks (stock_code, name, market, currency, status)
         VALUES (?, ?, 'NASDAQ', 'USD', 'ACTIVE')
         ON DUPLICATE KEY UPDATE status = 'ACTIVE'`,
        [code, NAMES[code] || code]
      );
    }

    console.log(`코어 종목 시딩 완료: ${codes.join(', ')}`);
    process.exitCode = 0;
  } catch (err) {
    console.error('코어 종목 시딩 실패:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
