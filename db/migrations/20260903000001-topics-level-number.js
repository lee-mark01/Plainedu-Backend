'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// learning.repository의 주제 목록 쿼리는 처음부터 Topics.level_number를 조회하고
// idx_topics_level_sort(level_number, sort_order)를 전제로 작성돼 있었는데,
// 정작 컬럼과 인덱스를 만드는 마이그레이션이 나가지 않아
// GET /api/learning/topics가 로그인 상태에서 항상 500이었다.
//
// MySQL은 ALTER TABLE ... ADD COLUMN IF NOT EXISTS를 지원하지 않아
// information_schema로 먼저 존재 여부를 확인한 뒤 필요한 경우에만 실행한다.
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
    .then(() => columnExists(db, 'Topics', 'level_number'))
    .then((exists) =>
      exists
        ? null
        : // 기존 주제는 전부 레벨 1로 본다. topicsQuerySchema의 level 기본값이 1이라
          // 백필 값과 무기본 조회가 어긋나지 않는다.
          db.runSql('ALTER TABLE Topics ADD COLUMN level_number INT NOT NULL DEFAULT 1 AFTER title')
    )
    .then(() => indexExists(db, 'Topics', 'idx_topics_level_sort'))
    .then((exists) =>
      exists
        ? null
        : db.runSql('CREATE INDEX idx_topics_level_sort ON Topics (level_number, sort_order)')
    );
};

exports.down = function (db) {
  return Promise.resolve()
    .then(() => indexExists(db, 'Topics', 'idx_topics_level_sort'))
    .then((exists) => (exists ? db.runSql('DROP INDEX idx_topics_level_sort ON Topics') : null))
    .then(() => columnExists(db, 'Topics', 'level_number'))
    .then((exists) => (exists ? db.runSql('ALTER TABLE Topics DROP COLUMN level_number') : null));
};

exports._meta = { version: 1 };
