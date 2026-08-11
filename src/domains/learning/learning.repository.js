const pool = require('../../config/db');

// 모든 repository 함수는 마지막 인자로 executor(pool 또는 트랜잭션 conn)를 받음.
// 트랜잭션 밖 호출은 기본값(pool)으로 동작하고, 트랜잭션 안에서 호출 시 conn을 명시.

// =============================================================================
// 1. Topics (주제)
// =============================================================================

/**
 * 특정 레벨의 주제 목록 + 유저별 진행현황 조회
 * - 각 주제의 숏폼 총 개수 / 완료 개수
 * - 각 주제의 퀴즈 총 개수 / 정답 개수
 * - UserProgress의 is_shortform_done, is_quiz_done
 *
 * idx_topics_level_sort (level_number, sort_order) 복합 인덱스 활용.
 */
const findAllTopicsWithProgress = async (userId, levelNumber, executor = pool) => {
  const sql = `
    SELECT
      t.id,
      t.title,
      t.level_number,
      t.sort_order,

      -- 숏폼 진행률
      COUNT(DISTINCT sf.id) AS total_shortforms,
      COUNT(DISTINCT CASE WHEN usl.is_completed = TRUE THEN sf.id END) AS completed_shortforms,

      -- 퀴즈 진행률
      COUNT(DISTINCT q.id) AS total_quizzes,
      COUNT(DISTINCT CASE WHEN uql.is_correct = TRUE THEN uql.quiz_id END) AS correct_quizzes,

      -- 진행 상태
      IFNULL(up.is_shortform_done, FALSE) AS is_shortform_done,
      IFNULL(up.is_quiz_done, FALSE) AS is_quiz_done

    FROM Topics t
    LEFT JOIN ShortForms sf ON sf.topic_id = t.id
    LEFT JOIN UserShortformLog usl ON usl.shortform_id = sf.id AND usl.user_id = ?
    LEFT JOIN Quizzes q ON q.topic_id = t.id
    LEFT JOIN UserQuizLog uql ON uql.quiz_id = q.id AND uql.user_id = ?
    LEFT JOIN UserProgress up ON up.topic_id = t.id AND up.user_id = ?
    WHERE t.level_number = ?
    GROUP BY t.id, t.title, t.level_number, t.sort_order, up.is_shortform_done, up.is_quiz_done
    ORDER BY t.sort_order ASC
  `;
  const [rows] = await executor.query(sql, [userId, userId, userId, levelNumber]);
  return rows;
};

/**
 * 특정 주제 존재 여부 확인
 */
const findTopicById = async (topicId, executor = pool) => {
  const sql = `SELECT id, title, sort_order FROM Topics WHERE id = ?`;
  const [rows] = await executor.query(sql, [topicId]);
  return rows[0] || null;
};

// =============================================================================
// 2. ShortForms (숏폼)
// =============================================================================

/**
 * 특정 주제의 숏폼 목록 + 유저 상호작용 상태
 */
const findShortformsByTopic = async (userId, topicId, executor = pool) => {
  const sql = `
    SELECT
      sf.id,
      sf.title,
      sf.description,
      sf.video_url,
      sf.sort_order,
      IFNULL(usl.is_completed, FALSE) AS is_completed,
      IFNULL(usl.is_liked, FALSE) AS is_liked,
      IFNULL(usl.is_saved, FALSE) AS is_saved
    FROM ShortForms sf
    LEFT JOIN UserShortformLog usl ON usl.shortform_id = sf.id AND usl.user_id = ?
    WHERE sf.topic_id = ?
    ORDER BY sf.sort_order ASC
  `;
  const [rows] = await executor.query(sql, [userId, topicId]);
  return rows;
};

/**
 * 숏폼 단건 조회 (존재 확인용)
 */
const findShortformById = async (shortformId, executor = pool) => {
  const sql = `SELECT id, topic_id, title FROM ShortForms WHERE id = ?`;
  const [rows] = await executor.query(sql, [shortformId]);
  return rows[0] || null;
};

/**
 * 숏폼 시청 완료 처리 (UPSERT)
 * - 기존 기록 없으면 INSERT, 있으면 is_completed = TRUE로 UPDATE
 */
const upsertShortformComplete = async (userId, shortformId, executor = pool) => {
  const sql = `
    INSERT INTO UserShortformLog (user_id, shortform_id, is_completed)
    VALUES (?, ?, TRUE)
    ON DUPLICATE KEY UPDATE is_completed = TRUE
  `;
  const [result] = await executor.query(sql, [userId, shortformId]);
  return result;
};

/**
 * 숏폼 좋아요 토글 (UPSERT)
 * - 기존 값의 반대로 전환
 */
const upsertShortformLike = async (userId, shortformId, executor = pool) => {
  const sql = `
    INSERT INTO UserShortformLog (user_id, shortform_id, is_liked)
    VALUES (?, ?, TRUE)
    ON DUPLICATE KEY UPDATE is_liked = NOT is_liked
  `;
  const [result] = await executor.query(sql, [userId, shortformId]);
  return result;
};

/**
 * 숏폼 저장 토글 (UPSERT)
 */
const upsertShortformSave = async (userId, shortformId, executor = pool) => {
  const sql = `
    INSERT INTO UserShortformLog (user_id, shortform_id, is_saved)
    VALUES (?, ?, TRUE)
    ON DUPLICATE KEY UPDATE is_saved = NOT is_saved
  `;
  const [result] = await executor.query(sql, [userId, shortformId]);
  return result;
};

/**
 * 유저의 특정 숏폼 상호작용 상태 조회
 */
const findUserShortformLog = async (userId, shortformId, executor = pool) => {
  const sql = `
    SELECT is_completed, is_liked, is_saved
    FROM UserShortformLog
    WHERE user_id = ? AND shortform_id = ?
  `;
  const [rows] = await executor.query(sql, [userId, shortformId]);
  return rows[0] || null;
};

// =============================================================================
// 3. Quizzes (퀴즈)
// =============================================================================

/**
 * 특정 주제의 퀴즈 목록 조회
 * - question_data에 문제/선택지/힌트, answer_data에 정답/해설이 JSON으로 저장
 */
const findQuizzesByTopic = async (topicId, executor = pool) => {
  const sql = `
    SELECT
      id,
      type,
      difficulty,
      question_data,
      sort_order
    FROM Quizzes
    WHERE topic_id = ?
    ORDER BY sort_order ASC
  `;
  const [rows] = await executor.query(sql, [topicId]);
  return rows;
};

/**
 * 특정 퀴즈의 정답 데이터 조회 (채점용)
 */
const findQuizAnswerById = async (quizId, executor = pool) => {
  const sql = `
    SELECT id, topic_id, type, answer_data
    FROM Quizzes
    WHERE id = ?
  `;
  const [rows] = await executor.query(sql, [quizId]);
  return rows[0] || null;
};

/**
 * 퀴즈 결과 개별 기록 저장 (UserQuizLog)
 * - 같은 (user_id, quiz_id) 조합이 여러 번 INSERT될 수 있음 (재도전 허용).
 * - 진행률 계산 시에는 GROUP BY로 distinct 처리.
 */
const insertQuizLog = async (userId, quizId, isCorrect, executor = pool) => {
  const sql = `
    INSERT INTO UserQuizLog (user_id, quiz_id, is_correct)
    VALUES (?, ?, ?)
  `;
  const [result] = await executor.query(sql, [userId, quizId, isCorrect]);
  return result;
};

/**
 * 토픽의 퀴즈 풀이 진행 현황 요약 (완료 처리용).
 *
 * 반환:
 *   - total: 토픽의 전체 퀴즈 수
 *   - attempted: 사용자가 풀어본 퀴즈 수 (DISTINCT quiz_id)
 *   - correct: 한 번이라도 정답을 맞춘 퀴즈 수 (DISTINCT quiz_id)
 *
 * "한 번이라도 정답이면 정답으로 카운트" 정책 — 학습 친화적.
 */
const findQuizSummaryByTopic = async (userId, topicId, executor = pool) => {
  const sql = `
    SELECT
      COUNT(DISTINCT q.id) AS total,
      COUNT(DISTINCT uql.quiz_id) AS attempted,
      COUNT(DISTINCT CASE WHEN uql.is_correct = TRUE THEN uql.quiz_id END) AS correct
    FROM Quizzes q
    LEFT JOIN UserQuizLog uql ON uql.quiz_id = q.id AND uql.user_id = ?
    WHERE q.topic_id = ?
  `;
  const [rows] = await executor.query(sql, [userId, topicId]);
  return rows[0];
};

// =============================================================================
// 4. UserProgress (학습 진행률)
// =============================================================================

/**
 * 유저 진행률 조회
 */
const findUserProgress = async (userId, topicId, executor = pool) => {
  const sql = `
    SELECT user_id, topic_id, is_shortform_done, is_quiz_done, correct_count, total_quiz_count, updated_at
    FROM UserProgress
    WHERE user_id = ? AND topic_id = ?
  `;
  const [rows] = await executor.query(sql, [userId, topicId]);
  return rows[0] || null;
};

/**
 * 유저 진행률 UPSERT (숏폼 완료 처리)
 */
const upsertProgressShortformDone = async (userId, topicId, executor = pool) => {
  const sql = `
    INSERT INTO UserProgress (user_id, topic_id, is_shortform_done)
    VALUES (?, ?, TRUE)
    ON DUPLICATE KEY UPDATE is_shortform_done = TRUE
  `;
  const [result] = await executor.query(sql, [userId, topicId]);
  return result;
};

/**
 * 유저 진행률 UPSERT (퀴즈 완료 처리)
 */
const upsertProgressQuizDone = async (userId, topicId, correctCount, totalQuizCount, executor = pool) => {
  const sql = `
    INSERT INTO UserProgress (user_id, topic_id, is_quiz_done, correct_count, total_quiz_count)
    VALUES (?, ?, TRUE, ?, ?)
    ON DUPLICATE KEY UPDATE
      is_quiz_done = TRUE,
      correct_count = VALUES(correct_count),
      total_quiz_count = VALUES(total_quiz_count)
  `;
  const [result] = await executor.query(sql, [userId, topicId, correctCount, totalQuizCount]);
  return result;
};

/**
 * 특정 주제에서 유저가 숏폼을 모두 완료했는지 확인
 */
const checkAllShortformsCompleted = async (userId, topicId, executor = pool) => {
  const sql = `
    SELECT
      COUNT(sf.id) AS total,
      COUNT(CASE WHEN usl.is_completed = TRUE THEN 1 END) AS completed
    FROM ShortForms sf
    LEFT JOIN UserShortformLog usl ON usl.shortform_id = sf.id AND usl.user_id = ?
    WHERE sf.topic_id = ?
  `;
  const [rows] = await executor.query(sql, [userId, topicId]);
  const { total, completed } = rows[0];
  return total > 0 && total === completed;
};

// =============================================================================
// 5. 오늘의 플로우
// =============================================================================

/**
 * 오늘 사용자가 완료한 학습 단계 수를 조회.
 *
 * 단계 정의 (현재 학습 플로우 기준):
 *   - step1: 오늘 어떤 숏폼이든 시청 완료한 기록 존재
 *   - step2: 오늘 어떤 퀴즈든 풀이한 기록 존재
 *   - step3: 모의투자 단계 (MVP 미구현, 항상 0)
 *
 * 모두 created_at 기준 ─ UPDATE만 일어난 row(좋아요 토글 등)는 today에 안 잡힌다.
 * 정확도가 필요해지면 별도 completed_at 컬럼을 추가하는 식으로 보강.
 */
const findTodayFlowSummary = async (userId, executor = pool) => {
  const sql = `
    SELECT
      EXISTS (
        SELECT 1 FROM UserShortformLog
         WHERE user_id = ?
           AND is_completed = TRUE
           AND DATE(created_at) = CURDATE()
      ) AS step1_done,
      EXISTS (
        SELECT 1 FROM UserQuizLog
         WHERE user_id = ?
           AND DATE(created_at) = CURDATE()
      ) AS step2_done
  `;
  const [rows] = await executor.query(sql, [userId, userId]);
  return rows[0];
};

module.exports = {
  // Topics
  findAllTopicsWithProgress,
  findTopicById,

  // ShortForms
  findShortformsByTopic,
  findShortformById,
  upsertShortformComplete,
  upsertShortformLike,
  upsertShortformSave,
  findUserShortformLog,

  // Quizzes
  findQuizzesByTopic,
  findQuizAnswerById,
  insertQuizLog,
  findQuizSummaryByTopic,

  // UserProgress
  findUserProgress,
  upsertProgressShortformDone,
  upsertProgressQuizDone,
  checkAllShortformsCompleted,

  // 오늘의 플로우
  findTodayFlowSummary,
};
