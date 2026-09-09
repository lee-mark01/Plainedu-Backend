'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 알림 수신 설정.
//
// 항목마다 컬럼을 만들지 않고 (user_id, pref_key) 한 행씩 쌓는 이유:
// 알림 종류는 기능이 늘 때마다 함께 는다. 컬럼 방식이면 항목 하나 추가에 마이그레이션이 필요하고,
// 부분 수정(요청 14: "한 항목만 바꿀 때 나머지가 초기화되지 않아야 한다")도 행 단위가 자연스럽다.
//
// 행이 없으면 "서버 기본값"이다. 가입 시 전 항목을 미리 넣지 않는다 — 기본값이 바뀌면
// 미리 넣어둔 행들이 옛 기본값으로 굳어 새 정책이 기존 유저에게 적용되지 않는다.
// 기본값은 src/domains/user/notificationPref.defaults.js가 갖는다.
//
// 마케팅 수신 동의는 여기 두지 않는다. UserAgreements.MARKETING이 이미 갖고 있고,
// 동의는 법적 증빙(동의 시각·약관 버전)이 필요해 성격이 다르다. 두 곳에 두면 어긋난다.
exports.up = function (db) {
  return db.runSql(
    `CREATE TABLE IF NOT EXISTS NotificationPrefs (
       id          BIGINT      NOT NULL AUTO_INCREMENT,
       user_id     INT         NOT NULL,
       pref_key    VARCHAR(64) NOT NULL,
       is_enabled  BOOLEAN     NOT NULL,
       updated_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       UNIQUE KEY uq_np_user_key (user_id, pref_key),
       CONSTRAINT fk_np_user
         FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
};

exports.down = function (db) {
  return db.runSql('DROP TABLE IF EXISTS NotificationPrefs');
};

exports._meta = { version: 1 };
