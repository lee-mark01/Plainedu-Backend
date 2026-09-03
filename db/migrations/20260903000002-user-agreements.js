'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 약관/개인정보/마케팅 동의 상태.
//
// 왜 Users 컬럼이 아니라 별도 테이블인가:
//   - 항목별 "언제 동의했는지"를 남겨야 한다(개인정보보호법상 증빙). 컬럼 3개로는 시각이 안 남는다.
//   - 동의 항목이 늘어도 ENUM만 추가하면 되고 Users 스키마는 안 건드린다.
//   - 마케팅은 켜고 끄는 값이라 다른 프로필 컬럼과 수명 주기가 다르다.
//
// 왜 이력 테이블이 아닌가: 현재 상태만 UPSERT한다(user_id+type UNIQUE). 분쟁 대응용 전체 이력이
// 필요해지면 append-only 로그를 따로 얹는다 — 지금 넣으면 매 조회가 "타입별 최신 행 찾기"가 된다.
//
// agreed_at은 철회해도 지우지 않는다. "언제 동의했었는지"가 증빙의 핵심이고,
// 철회 시각은 updated_at이 갖는다. 한 번도 동의한 적 없으면 NULL이다.
//
// version은 동의를 받은 시점의 약관 버전이다(src/config/agreements.js). 약관을 개정하면
// 저장된 version과 현재 version이 달라지고, 그게 재동의를 받아야 하는지 판단하는 근거가 된다.
// 시각만으로는 판단할 수 없다 — 개정일을 코드 밖에서 따로 관리해야 하기 때문이다.
exports.up = function (db) {
  return db.runSql(
    `CREATE TABLE IF NOT EXISTS UserAgreements (
       id          INT         NOT NULL AUTO_INCREMENT,
       user_id     INT         NOT NULL,
       type        ENUM('TERMS','PRIVACY','MARKETING') NOT NULL,
       is_agreed   BOOLEAN     NOT NULL DEFAULT FALSE,
       version     VARCHAR(20) NOT NULL DEFAULT '1.0',
       agreed_at   TIMESTAMP   NULL,
       updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       UNIQUE KEY uq_ua_user_type (user_id, type),
       CONSTRAINT fk_ua_user
         FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
};

exports.down = function (db) {
  return db.runSql('DROP TABLE IF EXISTS UserAgreements');
};

exports._meta = { version: 1 };
