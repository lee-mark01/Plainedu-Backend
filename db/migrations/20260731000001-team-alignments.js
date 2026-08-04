'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 팀 전략 준수도(Alignment) 주간 확정값 — 매주 금요일 종가 기준으로 계산해 저장 (랭킹 도메인 소유).
// 팀당 시즌당 1행(현재값)만 유지 — 이력은 DailyRankings.alignment_score가 매일 기록한다.
// Active MP 없는 팀은 행이 없고, 조회 측에서 0으로 처리한다 (전략 미제출 = 준수도 0, 2026-07-31 확정).
exports.up = function (db) {
  return db.runSql(
    `CREATE TABLE IF NOT EXISTS TeamAlignments (
       team_id    INT          NOT NULL,
       season_id  INT          NOT NULL,
       alignment  DECIMAL(5,2) NOT NULL,
       priced_at  DATE         NOT NULL,
       PRIMARY KEY (team_id, season_id),
       CONSTRAINT fk_ta_team FOREIGN KEY (team_id) REFERENCES Teams(id) ON DELETE CASCADE ON UPDATE CASCADE,
       CONSTRAINT fk_ta_season FOREIGN KEY (season_id) REFERENCES Seasons(id) ON DELETE CASCADE ON UPDATE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
};

exports.down = function (db) {
  return db.runSql('DROP TABLE IF EXISTS TeamAlignments');
};

exports._meta = { version: 1 };
