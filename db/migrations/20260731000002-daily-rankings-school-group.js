'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 고교/대학 리그 분리: 스냅샷의 rank_position이 "어느 리그 내 순위"인지 영구 기록.
// 과거 통합 시절 행은 NULL 유지 (구분 불가 — 재해석하지 않음).
exports.up = function (db) {
  return db.runSql(
    "ALTER TABLE DailyRankings ADD COLUMN school_group ENUM('HIGH_SCHOOL','UNIVERSITY') NULL AFTER target_type"
  );
};

exports.down = function (db) {
  return db.runSql('ALTER TABLE DailyRankings DROP COLUMN school_group');
};

exports._meta = { version: 1 };
