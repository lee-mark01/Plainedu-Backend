'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 랭킹 일일 스냅샷(Task 8): participation_rate를 NULL 허용으로 완화.
// 팀(Open Q 1: 참여율 정의 미정)·학교 보드(참여율 개념 없음)는 스텁 값을 영구 기록하지 않고
// NULL로 남긴다 — alignment_score NULL 결정(2026-07-28)과 같은 원칙. 개인 보드만 실값(%).
exports.up = function (db) {
  return db.runSql('ALTER TABLE DailyRankings MODIFY participation_rate DECIMAL(5,2) NULL');
};

exports.down = function (db) {
  // NOT NULL 원복 전에 NULL 행을 0으로 채워 MODIFY 실패 방지
  return Promise.resolve()
    .then(() => db.runSql('UPDATE DailyRankings SET participation_rate = 0 WHERE participation_rate IS NULL'))
    .then(() => db.runSql('ALTER TABLE DailyRankings MODIFY participation_rate DECIMAL(5,2) NOT NULL'));
};

exports._meta = { version: 1 };
