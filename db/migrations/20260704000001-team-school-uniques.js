'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// MySQL은 ALTER TABLE ... INDEX/COLUMN에 IF [NOT] EXISTS를 지원하지 않아
// information_schema로 먼저 존재 여부를 확인한 뒤 필요한 경우에만 실행한다.
// (db-migrate 드라이버별로 runSql 결과 형태가 달라 방어적으로 정규화한다)
const toRows = (result) => {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
};

const indexExists = (db, table, indexName) =>
  db
    .runSql(
      'SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
      [table, indexName]
    )
    .then((result) => toRows(result)[0].cnt > 0);

const columnExists = (db, table, column) =>
  db
    .runSql(
      'SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    )
    .then((result) => toRows(result)[0].cnt > 0);

exports.up = function (db) {
  return Promise.resolve()
    .then(() => indexExists(db, 'schools', 'idx_school_name'))
    .then((exists) => (exists ? db.runSql('ALTER TABLE schools DROP INDEX idx_school_name') : null))
    .then(() => indexExists(db, 'schools', 'uq_school_name_region'))
    .then((exists) =>
      exists ? null : db.runSql('ALTER TABLE schools ADD UNIQUE KEY uq_school_name_region (school_name, region)')
    )
    .then(() => columnExists(db, 'Teams', 'join_code'))
    .then((exists) =>
      exists ? null : db.runSql("ALTER TABLE Teams ADD COLUMN join_code VARCHAR(8) NOT NULL AFTER name")
    )
    .then(() => indexExists(db, 'Teams', 'uq_teams_join_code'))
    .then((exists) =>
      exists ? null : db.runSql('ALTER TABLE Teams ADD UNIQUE KEY uq_teams_join_code (join_code)')
    );
};

exports.down = function (db) {
  return Promise.resolve()
    .then(() => indexExists(db, 'Teams', 'uq_teams_join_code'))
    .then((exists) => (exists ? db.runSql('ALTER TABLE Teams DROP INDEX uq_teams_join_code') : null))
    .then(() => columnExists(db, 'Teams', 'join_code'))
    .then((exists) => (exists ? db.runSql('ALTER TABLE Teams DROP COLUMN join_code') : null))
    .then(() => indexExists(db, 'schools', 'uq_school_name_region'))
    .then((exists) => (exists ? db.runSql('ALTER TABLE schools DROP INDEX uq_school_name_region') : null))
    .then(() => indexExists(db, 'schools', 'idx_school_name'))
    .then((exists) => (exists ? null : db.runSql('ALTER TABLE schools ADD INDEX idx_school_name (school_name)')));
};

exports._meta = { version: 1 };
