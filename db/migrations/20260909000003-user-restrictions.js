'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 이용 제한과 이의신청.
//
// 부과 주체는 관리자다(Users.role = 'ADMIN'). 신고 누적 자동 제재는 넣지 않았다 —
// 조직적 신고에 악용될 수 있고, 사람이 판단하는 편이 오판이 적다.
//
// type이 값 하나뿐인 ENUM인 이유: 지금 필요한 제한은 "커뮤니티 전체 금지"뿐이다
// (2026-09-09 결정). 글쓰기만 막고 댓글은 허용하는 운영이 실제로 필요한지 불확실해
// 쪼개지 않았다. 컬럼을 아예 빼는 대신 ENUM으로 둔 이유는, 나중에 종류가 늘 때
// 기존 행이 이미 올바르게 분류돼 있어 백필이 필요 없기 때문이다.
//
// ends_at NULL은 영구 제한이다. 만료를 배치로 처리하지 않고 조회 시점에 판단한다
// (status='ACTIVE' AND (ends_at IS NULL OR ends_at > NOW())) — 배치가 늦게 돌아도
// 사용자가 만료된 제한에 걸리는 일이 없다. EXPIRED는 관리자가 목록에서 구분하기 위한 표시다.
//
// created_by/lifted_by를 남기는 이유: 제재는 분쟁이 생기는 영역이라 누가 언제 했는지가
// 기록돼야 한다. 관리자 계정이 삭제돼도 제재 이력은 남아야 하므로 SET NULL이다.
exports.up = function (db) {
  return db
    .runSql(
      `CREATE TABLE IF NOT EXISTS UserRestrictions (
         id          INT          NOT NULL AUTO_INCREMENT,
         user_id     INT          NOT NULL,
         type        ENUM('COMMUNITY_BLOCK') NOT NULL DEFAULT 'COMMUNITY_BLOCK',
         reason      ENUM('SPAM','ABUSE','ADULT','FALSE_INFO','ETC') NOT NULL,
         detail      VARCHAR(500) NULL,
         starts_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
         ends_at     TIMESTAMP    NULL,                    -- NULL = 영구
         status      ENUM('ACTIVE','LIFTED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
         created_by  INT          NULL,
         created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
         lifted_by   INT          NULL,
         lifted_at   TIMESTAMP    NULL,
         PRIMARY KEY (id),
         INDEX idx_ur_user_status (user_id, status, ends_at),
         INDEX idx_ur_status_created (status, created_at),
         CONSTRAINT fk_ur_user
           FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
         CONSTRAINT fk_ur_created_by
           FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE,
         CONSTRAINT fk_ur_lifted_by
           FOREIGN KEY (lifted_by) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    // 이의신청. status 네 값은 요청 11이 지정한 "접수·검토 중·승인·반려"에 대응한다.
    // 같은 제한 건에 한 번만 신청할 수 있게 UNIQUE를 건다 — 중복 접수를 허용하면
    // 관리자 목록이 같은 건으로 채워진다.
    .then(() =>
      db.runSql(
        `CREATE TABLE IF NOT EXISTS RestrictionAppeals (
           id              INT          NOT NULL AUTO_INCREMENT,
           restriction_id  INT          NOT NULL,
           user_id         INT          NOT NULL,
           content         VARCHAR(1000) NOT NULL,
           status          ENUM('RECEIVED','REVIEWING','APPROVED','REJECTED') NOT NULL DEFAULT 'RECEIVED',
           admin_comment   VARCHAR(500) NULL,
           created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
           processed_at    TIMESTAMP    NULL,
           processed_by    INT          NULL,
           PRIMARY KEY (id),
           UNIQUE KEY uq_ra_restriction (restriction_id),
           INDEX idx_ra_user_created (user_id, created_at),
           INDEX idx_ra_status_created (status, created_at),
           CONSTRAINT fk_ra_restriction
             FOREIGN KEY (restriction_id) REFERENCES UserRestrictions(id) ON DELETE CASCADE ON UPDATE CASCADE,
           CONSTRAINT fk_ra_user
             FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
           CONSTRAINT fk_ra_processed_by
             FOREIGN KEY (processed_by) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      )
    );
};

exports.down = function (db) {
  return db
    .runSql('DROP TABLE IF EXISTS RestrictionAppeals')
    .then(() => db.runSql('DROP TABLE IF EXISTS UserRestrictions'));
};

exports._meta = { version: 1 };
