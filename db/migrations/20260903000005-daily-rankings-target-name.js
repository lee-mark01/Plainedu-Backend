'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// 확정 시점의 대상 이름 스냅샷.
//
// DailyRankings는 날짜별로 확정된 과거 순위표인데 이름은 갖고 있지 않고 target_id만 든다.
// 리더보드는 그 id로 Teams를 다시 조회해 이름을 붙이므로(ranking.repository.findTeamProfiles),
// 팀이 해체되면 지난 날짜 순위표에 이름이 null인 행이 남는다. DailyRankings에는 Teams FK가
// 없어서 행 자체는 지워지지 않는다.
//
// 과거 순위가 스냅샷이면 이름도 스냅샷이어야 한다 — 확정 시점의 이름을 여기 박아두면
// 대상이 사라진 뒤에도 과거 기록이 자족적으로 읽힌다.
//
// target_name(팀 전용이 아닌 이름)으로 둔 이유: 이 테이블은 USER/TEAM/SCHOOL_*를 함께 담는다.
// 지금 채우는 건 TEAM 행뿐이지만(해체가 실제로 일어나는 유일한 경우), 탈퇴한 유저의 USER 행도
// 같은 문제를 갖고 있어 나중에 컬럼 추가 없이 채울 수 있게 일반 이름으로 만든다.
// 기존 행은 NULL이고, 호출부는 NULL이면 지금처럼 조인으로 이름을 찾는다.
// MySQL은 ADD COLUMN IF NOT EXISTS를 지원하지 않아 information_schema로 먼저 확인한다.
// 부분 적용된 환경에서 다시 돌려도 안전해야 한다.
const toRows = (result) => {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
};

const columnExists = (db, table, column) =>
  db
    .runSql(
      'SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    )
    .then((result) => toRows(result)[0].cnt > 0);

exports.up = function (db) {
  return columnExists(db, 'DailyRankings', 'target_name').then((exists) =>
    exists
      ? null
      : db.runSql('ALTER TABLE DailyRankings ADD COLUMN target_name VARCHAR(100) NULL AFTER target_id')
  );
};

exports.down = function (db) {
  return columnExists(db, 'DailyRankings', 'target_name').then((exists) =>
    exists ? db.runSql('ALTER TABLE DailyRankings DROP COLUMN target_name') : null
  );
};

exports._meta = { version: 1 };
