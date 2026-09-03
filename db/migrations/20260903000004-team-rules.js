'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 팀 운영 규칙. 팀당 한 벌이라 team_id가 곧 PK다(별도 id 없음).
//
// version은 낙관적 잠금용이다. 팀장이 여러 기기에서 열어두거나 위임 직후 두 사람이 같이 저장하면
// 뒤에 쓴 쪽이 앞의 내용을 통째로 덮어쓴다 — 규칙은 자유 텍스트라 병합할 수단이 없어서
// "읽은 버전이 아직 최신인가"를 저장 시점에 확인하는 방식으로 막는다.
// 저장할 때마다 1씩 오르고, 규칙이 없는 팀은 0으로 취급한다(행 자체가 없음).
//
// updated_by를 ON DELETE SET NULL로 둔 이유: 규칙을 쓴 사람이 팀을 나가거나 탈퇴해도
// 규칙 자체는 팀의 것으로 남아야 한다. 작성자만 사라지고 내용은 유지된다.
exports.up = function (db) {
  return db.runSql(
    `CREATE TABLE IF NOT EXISTS TeamRules (
       team_id     INT       NOT NULL,
       content     TEXT      NOT NULL,
       version     INT       NOT NULL DEFAULT 1,
       updated_by  INT       NULL,
       updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (team_id),
       CONSTRAINT fk_tr_team
         FOREIGN KEY (team_id) REFERENCES Teams(id) ON DELETE CASCADE ON UPDATE CASCADE,
       CONSTRAINT fk_tr_updated_by
         FOREIGN KEY (updated_by) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
};

exports.down = function (db) {
  return db.runSql('DROP TABLE IF EXISTS TeamRules');
};

exports._meta = { version: 1 };
