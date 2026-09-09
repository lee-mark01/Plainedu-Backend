'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// MySQL은 ENUM 확장·컬럼 추가에 IF NOT EXISTS를 지원하지 않아 information_schema로 확인한다.
const toRows = (result) => {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
};

const columnType = (db, table, column) =>
  db
    .runSql(
      'SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    )
    .then((result) => toRows(result)[0]?.t || '');

// 팀 가입 신청.
//
// 정책 (2026-09-09 결정): 코드를 맞게 입력하면 **가입 신청**이 되고 팀장이 승인해야 들어간다.
// 코드만으로 즉시 가입하던 동작이 바뀌므로 POST /api/teams/join의 응답도 팀 정보에서
// 신청 결과로 바뀐다.
//
// status에 CANCELED가 있는 이유: 한 유저는 대기 중 신청을 하나만 가질 수 있다.
// 다른 팀에 새로 신청하면 기존 대기 신청을 지우지 않고 CANCELED로 남긴다 —
// 지우면 "왜 사라졌지"를 설명할 수 없고, 팀장 쪽 목록에서도 흔적이 없어진다.
//
// position을 신청 시점에 받아두는 이유: 승인은 팀장이 하는데 신청자의 포지션을 팀장이
// 대신 고를 수는 없다. 기존 즉시 가입도 position을 함께 받았다.
//
// 대기 신청 유일성은 DB 제약으로 걸 수 없다(MySQL에 부분 유니크 인덱스가 없다).
// 서비스가 트랜잭션 안에서 잠그고 확인한다 — 인덱스는 그 조회를 위해 둔다.
exports.up = function (db) {
  return db
    .runSql(
      `CREATE TABLE IF NOT EXISTS TeamJoinRequests (
         id            INT       NOT NULL AUTO_INCREMENT,
         team_id       INT       NOT NULL,
         user_id       INT       NOT NULL,
         position      ENUM('TRADER','ANALYST') NOT NULL,
         status        ENUM('PENDING','APPROVED','REJECTED','CANCELED') NOT NULL DEFAULT 'PENDING',
         created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         processed_at  TIMESTAMP NULL,
         processed_by  INT       NULL,
         PRIMARY KEY (id),
         INDEX idx_tjr_team_status (team_id, status, created_at),
         INDEX idx_tjr_user_status (user_id, status),
         CONSTRAINT fk_tjr_team
           FOREIGN KEY (team_id) REFERENCES Teams(id) ON DELETE CASCADE ON UPDATE CASCADE,
         CONSTRAINT fk_tjr_user
           FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
         CONSTRAINT fk_tjr_processed_by
           FOREIGN KEY (processed_by) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    // 팀장에게 보낼 알림 종류를 추가한다. ENUM 확장은 기존 값을 건드리지 않아 안전하다.
    // 이미 확장돼 있으면(재실행) 건너뛴다.
    .then(() => columnType(db, 'Notifications', 'type'))
    .then((t) =>
      t.includes('TEAM_JOIN_REQUEST')
        ? null
        : db.runSql(
            `ALTER TABLE Notifications MODIFY type
               ENUM('FOLLOWEE_POST','POST_LIKE','POST_COMMENT','COMMENT_REPLY',
                    'VOTE_START','PORTFOLIO_CHANGED','TEAM_JOIN_REQUEST') NOT NULL`
          )
    );
};

exports.down = function (db) {
  // ENUM 축소는 TEAM_JOIN_REQUEST 알림이 남아 있으면 MySQL이 거부한다 — 그 자체가 안전장치다.
  return db
    .runSql("DELETE FROM Notifications WHERE type = 'TEAM_JOIN_REQUEST'")
    .then(() =>
      db.runSql(
        `ALTER TABLE Notifications MODIFY type
           ENUM('FOLLOWEE_POST','POST_LIKE','POST_COMMENT','COMMENT_REPLY',
                'VOTE_START','PORTFOLIO_CHANGED') NOT NULL`
      )
    )
    .then(() => db.runSql('DROP TABLE IF EXISTS TeamJoinRequests'));
};

exports._meta = { version: 1 };
