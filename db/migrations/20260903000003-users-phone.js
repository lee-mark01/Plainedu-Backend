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
//
// 항목마다 존재 여부를 확인하고 없을 때만 실행한다. 이 마이그레이션은 원래
// 20260819000002라는 이름으로 한 번 나갔다가 파일명이 바뀌었는데, db-migrate는 파일명으로
// 적용 여부를 추적하므로 그때 적용된 DB에서는 미적용으로 보여 다시 돌게 된다.
// MySQL은 ADD COLUMN IF NOT EXISTS를 지원하지 않아 information_schema로 직접 확인한다.
const toRows = (result) => {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
};

const columnExists = (db, table, column) =>
  db
    .runSql(
      'SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    )
    .then((result) => toRows(result)[0].cnt > 0);

const indexExists = (db, table, index) =>
  db
    .runSql(
      'SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
      [table, index]
    )
    .then((result) => toRows(result)[0].cnt > 0);

exports.up = function (db) {
  return Promise.resolve()
    .then(() => columnExists(db, 'Users', 'phone'))
    .then((exists) =>
      exists ? null : db.runSql('ALTER TABLE Users ADD COLUMN phone VARCHAR(20) NULL AFTER nickname')
    )
    .then(() => columnExists(db, 'Users', 'phone_verified_at'))
    .then((exists) =>
      exists
        ? null
        : db.runSql('ALTER TABLE Users ADD COLUMN phone_verified_at TIMESTAMP NULL AFTER phone')
    )
    .then(() => indexExists(db, 'Users', 'idx_users_phone'))
    .then((exists) => (exists ? null : db.runSql('CREATE INDEX idx_users_phone ON Users (phone)')));
};

exports.down = function (db) {
  return Promise.resolve()
    .then(() => indexExists(db, 'Users', 'idx_users_phone'))
    .then((exists) => (exists ? db.runSql('DROP INDEX idx_users_phone ON Users') : null))
    .then(() => columnExists(db, 'Users', 'phone_verified_at'))
    .then((exists) => (exists ? db.runSql('ALTER TABLE Users DROP COLUMN phone_verified_at') : null))
    .then(() => columnExists(db, 'Users', 'phone'))
    .then((exists) => (exists ? db.runSql('ALTER TABLE Users DROP COLUMN phone') : null));
};

exports._meta = { version: 1 };
