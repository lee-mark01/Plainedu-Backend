'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 학교 동기화가 아직 실행되지 않은 환경에서도 온보딩 검색이 막히지 않도록
// 디자인/테스트에서 사용하는 핵심 학교를 멱등하게 보장한다.
exports.up = function (db) {
  return db.runSql(`
    INSERT IGNORE INTO schools (school_name, region, school_group) VALUES
      ('서울대학교', '서울특별시', 'UNIVERSITY'),
      ('한국과학기술원', '대전광역시', 'UNIVERSITY'),
      ('연세대학교', '서울특별시', 'UNIVERSITY'),
      ('고려대학교', '서울특별시', 'UNIVERSITY'),
      ('성균관대학교', '서울특별시', 'UNIVERSITY'),
      ('한양대학교', '서울특별시', 'UNIVERSITY'),
      ('서울시립대학교', '서울특별시', 'UNIVERSITY'),
      ('인천대학교', '인천광역시', 'UNIVERSITY'),
      ('남서울대학교', '충청남도', 'UNIVERSITY'),
      ('포항공과대학교', '경상북도', 'UNIVERSITY'),
      ('인천고등학교', '인천광역시', 'HIGH_SCHOOL'),
      ('인천백석고등학교', '인천광역시', 'HIGH_SCHOOL'),
      ('인천재능고등학교', '인천광역시', 'HIGH_SCHOOL'),
      ('서인천고등학교', '인천광역시', 'HIGH_SCHOOL')
  `);
};

exports.down = function () {
  return Promise.resolve();
};

exports._meta = { version: 1 };
