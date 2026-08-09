-- 롤백: 미국장 변경 이전으로 되돌리기

ALTER TABLE Stocks
  DROP COLUMN currency,
  MODIFY COLUMN market ENUM('KOSPI', 'KOSDAQ') NOT NULL;
