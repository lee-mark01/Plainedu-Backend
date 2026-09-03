'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 휴대폰 번호 + 인증 시각.
//
// 왜 UNIQUE를 걸지 않는가: 통신사는 해지된 번호를 일정 기간 뒤 다른 사람에게 재할당한다.
// DB UNIQUE로 영구 점유하면 그 번호를 새로 받은 정상 가입자가 영영 인증할 수 없다.
// 대신 인증 시점에 "이미 다른 계정이 인증한 번호"인지 조회해서 409로 막는다
// (phoneVerification.service). 인덱스는 그 조회를 위해 둔다.
//
// phone_verified_at이 시각인 이유: boolean이면 "언제 본인확인했는지"가 남지 않는다.
// 미인증은 NULL이고, 번호를 바꾸면 다시 NULL로 되돌린다.
exports.up = function (db) {
  return db.runSql(
    `ALTER TABLE Users
       ADD COLUMN phone VARCHAR(20) NULL AFTER nickname,
       ADD COLUMN phone_verified_at TIMESTAMP NULL AFTER phone,
       ADD INDEX idx_users_phone (phone)`
  );
};

exports.down = function (db) {
  return db.runSql(
    `ALTER TABLE Users
       DROP INDEX idx_users_phone,
       DROP COLUMN phone_verified_at,
       DROP COLUMN phone`
  );
};

exports._meta = { version: 1 };
