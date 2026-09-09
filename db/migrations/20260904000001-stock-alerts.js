'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 종목별 알림 조건 + 기기 푸시 토큰.
//
// StockAlerts — 종목 하나에 조건 네 종류(목표가·손절가·일일 등락률·거래량)까지 걸 수 있고,
// 설정한 것만 행으로 남는다. 조회 시 "설정 안 함"을 빈 값으로 채워 내리지 않고 아예 빼는 이유는
// 프론트가 기본 4개 항목에 합쳐 그리기 때문이다(요청 4).
//   - uq_sa_user_stock_type: 같은 종목·같은 종류는 하나뿐. PUT의 멱등성이 여기에 걸린다.
//   - threshold를 DECIMAL(18,4)로 둔 이유: 가격(달러)과 등락률(%)과 거래량(주)을 한 컬럼에
//     담는다. 종류마다 단위가 다르지만 서버는 임계값을 비교만 하고 해석은 종류가 정한다.
//     거래량이 정수라도 소수 자리를 남겨두면 나중에 "평균 대비 배수" 같은 조건을 추가할 때
//     컬럼을 바꾸지 않아도 된다.
//
// PushTokens — 기기 토큰은 계정이 아니라 기기에 딸린 값이다.
//   - uq_pt_token(토큰 유일): 한 기기 토큰은 한 계정에만 붙는다. 기기에서 로그아웃 후 다른
//     계정으로 들어오면 소유자를 옮겨야 하고(요청 6의 "토큰 소유권"), 그렇지 않으면 이전
//     계정의 알림이 남의 기기로 간다. 같은 토큰이 여러 행으로 남으면 한 번 보낼 때 여러 번
//     발송되므로 중복 전송 방지의 절반도 이 제약이 맡는다.
exports.up = function (db) {
  return db
    .runSql(
      `CREATE TABLE IF NOT EXISTS StockAlerts (
         id          BIGINT        NOT NULL AUTO_INCREMENT,
         user_id     INT           NOT NULL,
         stock_code  VARCHAR(20)   NOT NULL,
         type        ENUM('TARGET_PRICE','STOP_LOSS','DAILY_CHANGE','VOLUME') NOT NULL,
         threshold   DECIMAL(18,4) NOT NULL,
         is_enabled  BOOLEAN       NOT NULL DEFAULT TRUE,
         created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         UNIQUE KEY uq_sa_user_stock_type (user_id, stock_code, type),
         INDEX idx_sa_user (user_id),
         INDEX idx_sa_stock_enabled (stock_code, is_enabled),
         CONSTRAINT fk_sa_user
           FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
         CONSTRAINT fk_sa_stock
           FOREIGN KEY (stock_code) REFERENCES Stocks(stock_code) ON UPDATE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    .then(() =>
      db.runSql(
        `CREATE TABLE IF NOT EXISTS PushTokens (
           id          BIGINT       NOT NULL AUTO_INCREMENT,
           user_id     INT          NOT NULL,
           token       VARCHAR(255) NOT NULL,
           platform    ENUM('IOS','ANDROID','WEB') NOT NULL,
           created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
           updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           PRIMARY KEY (id),
           UNIQUE KEY uq_pt_token (token),
           INDEX idx_pt_user (user_id),
           CONSTRAINT fk_pt_user
             FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      )
    );
};

exports.down = function (db) {
  return db
    .runSql('DROP TABLE IF EXISTS PushTokens')
    .then(() => db.runSql('DROP TABLE IF EXISTS StockAlerts'));
};

exports._meta = { version: 1 };
