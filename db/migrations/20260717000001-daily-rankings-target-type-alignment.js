'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 랭킹 도메인(스펙 §4): 소속 랭킹 2종 구분을 위해 target_type ENUM 확장 + 팀 랭킹용 alignment_score 추가.
// ENUM 축소(down)는 신규 값이 든 행이 있으면 MySQL이 에러를 내므로 그 자체가 안전장치다.
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
    .then(() =>
      db.runSql(
        "ALTER TABLE DailyRankings MODIFY target_type ENUM('USER','TEAM','SCHOOL_INDIVIDUAL','SCHOOL_TEAM') NOT NULL"
      )
    )
    .then(() => columnExists(db, 'DailyRankings', 'alignment_score'))
    .then((exists) =>
      exists
        ? null
        : db.runSql(
            'ALTER TABLE DailyRankings ADD COLUMN alignment_score DECIMAL(6,2) NULL AFTER participation_rate'
          )
    );
};

exports.down = function (db) {
  return Promise.resolve()
    .then(() => columnExists(db, 'DailyRankings', 'alignment_score'))
    .then((exists) =>
      exists ? db.runSql('ALTER TABLE DailyRankings DROP COLUMN alignment_score') : null
    )
    .then(() =>
      db.runSql("ALTER TABLE DailyRankings MODIFY target_type ENUM('USER','TEAM','SCHOOL') NOT NULL")
    );
};

exports._meta = { version: 1 };
