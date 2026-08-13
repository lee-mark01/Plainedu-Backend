'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// "ACTIVE 시즌은 항상 최대 1개" — 코드 전역이 이미 전제하는 불변식(findActiveSeason ... LIMIT 1)을
// DB가 강제하게 한다.
//
// 왜 필요한가: 시즌 전환은 스케줄러가 아니라 "종료일이 지난 뒤 들어온 첫 조회 요청"이 수행한다
// (account.service.getOrCreateActiveSeason). 트래픽이 몰리는 순간엔 여러 요청이 동시에 "만료됨"을
// 관측하므로, 앱 레벨 체크만으로는 ACTIVE 시즌이 N개 INSERT될 수 있다. 그러면 요청마다 다른 시즌을
// 잡아 계좌가 갈라지고 랭킹 ZSET이 쪼개진다.
//
// 왜 start_date UNIQUE가 아닌가: 운영자가 시즌을 분기 도중에 조기 종료하면 같은 분기(=같은
// start_date) 시즌을 다시 열어야 하는데, start_date UNIQUE는 그 정상 운영을 막아버린다.
//
// 구현: status='ACTIVE'일 때만 1, 아니면 NULL인 생성 컬럼에 UNIQUE.
// MySQL UNIQUE 인덱스는 NULL 중복을 허용하므로 COMPLETED/UPCOMING 시즌은 몇 개든 공존한다.
// 경합에서 진 요청은 ER_DUP_ENTRY를 받고, account.repository.createSeason이 이를 null로 바꿔
// 호출부가 이긴 요청의 시즌을 다시 읽게 한다.
//
// 적용 실패 시: 이미 ACTIVE 시즌이 2개 이상이라는 뜻이므로 하나만 남기고 정리할 것.
//   SELECT id, name, status FROM Seasons WHERE status = 'ACTIVE';
exports.up = function (db) {
  return db.runSql(
    `ALTER TABLE Seasons
       ADD COLUMN active_uniq TINYINT
         GENERATED ALWAYS AS (IF(status = 'ACTIVE', 1, NULL)) VIRTUAL,
       ADD UNIQUE KEY uq_seasons_single_active (active_uniq)`
  );
};

exports.down = function (db) {
  return db.runSql(
    `ALTER TABLE Seasons
       DROP INDEX uq_seasons_single_active,
       DROP COLUMN active_uniq`
  );
};

exports._meta = { version: 1 };
