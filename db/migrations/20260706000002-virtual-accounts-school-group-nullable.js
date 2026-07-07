'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// OAuth 가입 시점엔 학교인증 전이라 school_group을 못 정하는 경우가 있어 NULL을 허용한다.
// (VirtualAccounts는 아직 생성 코드가 없어 데이터가 0행 — 안전하게 재정의 가능)
exports.up = function (db) {
  return db.runSql("ALTER TABLE VirtualAccounts MODIFY COLUMN school_group ENUM('HIGH_SCHOOL','UNIVERSITY') NULL");
};

exports.down = function (db) {
  return db.runSql("ALTER TABLE VirtualAccounts MODIFY COLUMN school_group ENUM('HIGH_SCHOOL','UNIVERSITY') NOT NULL");
};

exports._meta = { version: 1 };
