'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 검색·관심종목·주문·MP가 빈 Stocks 테이블에서도 즉시 동작하도록
// 핵심 미국 종목을 멱등하게 보장한다. 전체 종목 동기화(seed:stocks)는 별도 운영 작업이다.
exports.up = function (db) {
  return db.runSql(`
    INSERT IGNORE INTO Stocks (stock_code, name, market, currency, status) VALUES
      ('AAPL', 'Apple Inc.', 'NASDAQ', 'USD', 'ACTIVE'),
      ('MSFT', 'Microsoft Corporation', 'NASDAQ', 'USD', 'ACTIVE'),
      ('GOOGL', 'Alphabet Inc. Class A', 'NASDAQ', 'USD', 'ACTIVE'),
      ('AMZN', 'Amazon.com Inc.', 'NASDAQ', 'USD', 'ACTIVE'),
      ('NVDA', 'NVIDIA Corporation', 'NASDAQ', 'USD', 'ACTIVE'),
      ('TSLA', 'Tesla Inc.', 'NASDAQ', 'USD', 'ACTIVE'),
      ('META', 'Meta Platforms Inc.', 'NASDAQ', 'USD', 'ACTIVE'),
      ('NFLX', 'Netflix Inc.', 'NASDAQ', 'USD', 'ACTIVE'),
      ('JPM', 'JPMorgan Chase & Co.', 'NYSE', 'USD', 'ACTIVE'),
      ('KO', 'The Coca-Cola Company', 'NYSE', 'USD', 'ACTIVE')
  `);
};

// 운영 데이터가 이 종목들을 참조할 수 있으므로 롤백에서도 삭제하지 않는다.
exports.down = function () {
  return Promise.resolve();
};

exports._meta = { version: 1 };
