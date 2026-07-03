-- Stocks 테이블을 미국장 기준으로 변경
-- market ENUM: KOSPI/KOSDAQ → NASDAQ/NYSE
-- currency 컬럼 추가
-- 기존 한국 종목 데이터 삭제 후 ENUM 변경

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE PostStockTags;
TRUNCATE TABLE Watchlist;
TRUNCATE TABLE AccountHoldings;
TRUNCATE TABLE Orders;
TRUNCATE TABLE PortfolioAllocations;
TRUNCATE TABLE Stocks;

SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE Stocks
  MODIFY COLUMN market ENUM('NASDAQ', 'NYSE') NOT NULL,
  ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'USD' AFTER market;
