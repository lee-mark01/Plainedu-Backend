'use strict';

let dbm, type, seed, Promise;

exports.setup = function (options, seedLink) {
  dbm = options.dbmigrate;
  type = dbm.dataType;
  seed = seedLink;
  Promise = options.Promise;
};

// MySQL은 ADD COLUMN IF NOT EXISTS를 지원하지 않아 information_schema로 확인한다.
// 파일명이 바뀌거나 부분 적용된 환경에서 다시 돌려도 안전해야 한다.
const toRows = (result) => {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
};

const countQuery = (db, sql, params) =>
  db.runSql(sql, params).then((result) => toRows(result)[0].cnt > 0);

const columnExists = (db, table, column) =>
  countQuery(
    db,
    'SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );

const indexExists = (db, table, index) =>
  countQuery(
    db,
    'SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    [table, index]
  );

const constraintExists = (db, table, constraint) =>
  countQuery(
    db,
    'SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
    [table, constraint]
  );

// 퀴즈 응시 회차.
//
// UserQuizLog는 문제 하나 풀 때마다 한 행이라 "어디까지가 1회차인가"를 알 수 없다.
// created_at 간격으로 추측할 수는 있지만, 중간에 앱을 껐다 켜거나 하루 뒤에 이어 풀면 틀린다.
//
// 왜 UserQuizLog에 session_id만 붙이지 않았나:
//   - 점수는 확정 시점 스냅샷이어야 한다. 로그에서 매번 재계산하면 나중에 그 주제에 퀴즈가
//     추가·삭제됐을 때 분모가 달라져, 사용자가 그때 본 "3문제 중 2정답"이 어느 날
//     "5문제 중 2정답"으로 바뀐다.
//   - 최신순 페이지네이션이 단일 테이블 ORDER BY ... LIMIT으로 끝난다. 로그를 GROUP BY로
//     묶어 페이징하면 매 페이지마다 전체 집계가 필요하다.
//
// UserProgress와 역할이 다르다. UserProgress는 correct_count를 덮어써서 "현재 상태"만
// 갖고(마지막 회차), 이력은 이 테이블이 맡는다. 둘 다 필요하다.
//
// status를 두는 이유: 문제만 풀고 완료를 안 누른 채 이탈하면 IN_PROGRESS로 남는다.
// 다음에 같은 주제를 풀면 그 회차에 이어 붙으므로 데이터는 깨지지 않고, 목록에는
// COMPLETED만 내보내므로 사용자에게도 무해하다.
exports.up = function (db) {
  return db
    .runSql(
      `CREATE TABLE IF NOT EXISTS QuizAttempts (
         id                INT       NOT NULL AUTO_INCREMENT,
         user_id           INT       NOT NULL,
         topic_id          INT       NOT NULL,
         status            ENUM('IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'IN_PROGRESS',
         correct_count     INT       NOT NULL DEFAULT 0,
         total_quiz_count  INT       NOT NULL DEFAULT 0,
         score             INT       NULL,
         started_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         completed_at      TIMESTAMP NULL,
         PRIMARY KEY (id),
         INDEX idx_qa_user_completed (user_id, completed_at),
         INDEX idx_qa_user_topic_status (user_id, topic_id, status),
         CONSTRAINT fk_qa_user
           FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
         CONSTRAINT fk_qa_topic
           FOREIGN KEY (topic_id) REFERENCES Topics(id) ON DELETE CASCADE ON UPDATE CASCADE
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    )
    // 로그를 회차에 붙인다. NULL 허용 + ON DELETE SET NULL인 이유: 로그는 원본 기록이라
    // 회차가 지워져도 남아야 한다. 회차 없이 쌓인 과거 로그도 그대로 둔다.
    .then(() => columnExists(db, 'UserQuizLog', 'attempt_id'))
    .then((exists) =>
      exists
        ? null
        : db.runSql('ALTER TABLE UserQuizLog ADD COLUMN attempt_id INT NULL AFTER quiz_id')
    )
    .then(() => indexExists(db, 'UserQuizLog', 'idx_uql_attempt'))
    .then((exists) =>
      exists ? null : db.runSql('CREATE INDEX idx_uql_attempt ON UserQuizLog (attempt_id)')
    )
    .then(() => constraintExists(db, 'UserQuizLog', 'fk_uql_attempt'))
    .then((exists) =>
      exists
        ? null
        : db.runSql(
            `ALTER TABLE UserQuizLog ADD CONSTRAINT fk_uql_attempt
               FOREIGN KEY (attempt_id) REFERENCES QuizAttempts(id) ON DELETE SET NULL ON UPDATE CASCADE`
          )
    );
};

exports.down = function (db) {
  return Promise.resolve()
    .then(() => constraintExists(db, 'UserQuizLog', 'fk_uql_attempt'))
    .then((exists) =>
      exists ? db.runSql('ALTER TABLE UserQuizLog DROP FOREIGN KEY fk_uql_attempt') : null
    )
    .then(() => indexExists(db, 'UserQuizLog', 'idx_uql_attempt'))
    .then((exists) => (exists ? db.runSql('DROP INDEX idx_uql_attempt ON UserQuizLog') : null))
    .then(() => columnExists(db, 'UserQuizLog', 'attempt_id'))
    .then((exists) => (exists ? db.runSql('ALTER TABLE UserQuizLog DROP COLUMN attempt_id') : null))
    .then(() => db.runSql('DROP TABLE IF EXISTS QuizAttempts'));
};

exports._meta = { version: 1 };
