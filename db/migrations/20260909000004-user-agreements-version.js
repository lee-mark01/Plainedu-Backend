'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// UserAgreements.version 복구.
//
// 왜 별도 마이그레이션인가: 이 테이블을 만드는 마이그레이션은 원래 20260819000001이라는
// 이름으로 나갔다가 20260903000002로 파일명이 바뀌었다. db-migrate는 파일명으로 적용 여부를
// 추적하므로 두 이름이 모두 적용된 것으로 기록되는데, 두 번째는 CREATE TABLE IF NOT EXISTS라
// 테이블이 이미 있어 **아무것도 하지 않는다**. 그래서 그 사이에 추가된 version 컬럼이 빠진다.
//
// 원본 파일에 information_schema 가드를 넣어도 소용없다 — 이미 적용된 것으로 기록돼 다시 돌지
// 않는다. 빠진 컬럼을 채우려면 새 이름의 마이그레이션이어야 한다.
//
// 새로 만든 DB에서는 20260903000002가 version을 포함해 테이블을 만들었으므로 이 파일은 no-op다.
// 컬럼이 없는 DB에서는 agreement.repository의 UPSERT가 500으로 실패한다.
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

exports.up = function (db) {
  return Promise.resolve()
    .then(() => columnExists(db, 'UserAgreements', 'version'))
    .then((exists) =>
      exists
        ? null
        : db.runSql(
          "ALTER TABLE UserAgreements ADD COLUMN version VARCHAR(20) NOT NULL DEFAULT '1.0' AFTER is_agreed"
        )
    );
};

// 되돌리지 않는다. version이 없으면 동의 API가 깨지므로, 롤백이 곧 장애다.
// 테이블 자체를 되돌리려면 20260903000002의 down이 테이블을 지운다.
exports.down = function (db) {
  return Promise.resolve();
};

exports._meta = { version: 1 };
