'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

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

exports.up = function (db) {
  return Promise.resolve()
    .then(() => columnExists(db, 'schools', 'school_group'))
    .then((exists) =>
      exists
        ? null
        : db.runSql("ALTER TABLE schools ADD COLUMN school_group ENUM('HIGH_SCHOOL','UNIVERSITY') NULL AFTER region")
    )
    .then(() =>
      // 커리어넷 gubun 기반 값이 없는(기존 시딩분) 행만 이름 휴리스틱으로 백필.
      // 이후 관리자가 POST /api/schools/sync를 다시 돌리면 실제 gubun 기반 값으로 덮어써진다.
      db.runSql(
        "UPDATE schools SET school_group = CASE WHEN school_name LIKE '%대학%' THEN 'UNIVERSITY' ELSE 'HIGH_SCHOOL' END WHERE school_group IS NULL"
      )
    );
};

exports.down = function (db) {
  return columnExists(db, 'schools', 'school_group').then((exists) =>
    exists ? db.runSql('ALTER TABLE schools DROP COLUMN school_group') : null
  );
};

exports._meta = { version: 1 };
