'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 차단과 신고.
//
// CommunityBlocks — 선언은 단방향(내가 상대를 차단), 효과는 양방향(서로의 글·댓글·팔로우가
// 상대에게 보이지 않는다). 한쪽만 가리면 차단한 사람은 상대에게 계속 노출되므로
// 괴롭힘 회피 수단으로 쓸 수 없다.
//   - uq_cb_pair: 같은 상대를 두 번 차단할 수 없다(멱등 처리의 근거).
//   - idx_cb_blocked: 필터가 "내가 차단한 사람"과 "나를 차단한 사람"을 함께 보므로
//                     역방향 조회에도 인덱스가 필요하다.
//
// CommunityReports — 접수만 한다. 제재를 부과하는 주체(운영자 도구·자동 누적 규칙)가 아직
// 없어서 status는 RECEIVED에서 시작하고 처리 경로는 별건이다.
//   - uq_cr_reporter_target: 같은 대상을 여러 번 신고해도 한 건으로 본다. 중복 접수를 허용하면
//                            신고 수를 제재 근거로 쓸 때 한 사람이 수치를 부풀릴 수 있다.
//   - target_id에 FK를 걸지 않는 이유: 대상이 글·댓글·유저로 갈려 한 컬럼으로 참조할 수 없다.
//                                      신고된 글이 삭제돼도 접수 기록은 남아야 한다.
exports.up = function (db) {
  return db
    .runSql(
      `CREATE TABLE IF NOT EXISTS CommunityBlocks (
         id          INT       NOT NULL AUTO_INCREMENT,
         blocker_id  INT       NOT NULL,
         blocked_id  INT       NOT NULL,
         created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         UNIQUE KEY uq_cb_pair (blocker_id, blocked_id),
         INDEX idx_cb_blocked (blocked_id),
         CONSTRAINT fk_cb_blocker
           FOREIGN KEY (blocker_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
         CONSTRAINT fk_cb_blocked
           FOREIGN KEY (blocked_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    .then(() =>
      db.runSql(
        `CREATE TABLE IF NOT EXISTS CommunityReports (
           id            INT          NOT NULL AUTO_INCREMENT,
           reporter_id   INT          NOT NULL,
           target_type   ENUM('POST','COMMENT','USER') NOT NULL,
           target_id     INT          NOT NULL,
           reason        ENUM('SPAM','ABUSE','ADULT','FALSE_INFO','ETC') NOT NULL,
           detail        VARCHAR(500) NULL,
           status        ENUM('RECEIVED','REVIEWING','RESOLVED','REJECTED') NOT NULL DEFAULT 'RECEIVED',
           created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
           processed_at  TIMESTAMP    NULL,
           PRIMARY KEY (id),
           UNIQUE KEY uq_cr_reporter_target (reporter_id, target_type, target_id),
           INDEX idx_cr_target (target_type, target_id),
           INDEX idx_cr_status (status, created_at),
           CONSTRAINT fk_cr_reporter
             FOREIGN KEY (reporter_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      )
    );
};

exports.down = function (db) {
  return db
    .runSql('DROP TABLE IF EXISTS CommunityReports')
    .then(() => db.runSql('DROP TABLE IF EXISTS CommunityBlocks'));
};

exports._meta = { version: 1 };
