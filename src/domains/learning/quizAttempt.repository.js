const pool = require('../../config/db');

// 진행 중인 회차를 잠근 채로 찾는다.
//
// FOR UPDATE인 이유: 문제 두 개를 거의 동시에 제출하면 두 요청이 모두 "진행 중 회차 없음"을
// 보고 각자 회차를 만들 수 있다. 그러면 한 응시가 두 회차로 쪼개진다.
// 호출부가 트랜잭션 안에서 이 함수를 쓴 뒤 없을 때만 생성한다.
const findOpenAttemptForUpdate = async (user_id, topic_id, conn) => {
  const [rows] = await conn.query(
    `SELECT id FROM QuizAttempts
     WHERE user_id = ? AND topic_id = ? AND status = 'IN_PROGRESS'
     ORDER BY id DESC LIMIT 1
     FOR UPDATE`,
    [user_id, topic_id]
  );
  return rows[0] || null;
};

const createAttempt = async (user_id, topic_id, conn) => {
  const [result] = await conn.query(
    'INSERT INTO QuizAttempts (user_id, topic_id) VALUES (?, ?)',
    [user_id, topic_id]
  );
  return result.insertId;
};

// 이 회차에서 정답을 맞춘 문제 수. 같은 문제를 회차 안에서 두 번 맞혀도 하나로 센다
// (DISTINCT quiz_id) — 아니면 정답 수가 문제 수를 넘을 수 있다.
const countCorrectInAttempt = async (attempt_id, executor = pool) => {
  const [rows] = await executor.query(
    `SELECT COUNT(DISTINCT CASE WHEN is_correct = TRUE THEN quiz_id END) AS correct
     FROM UserQuizLog WHERE attempt_id = ?`,
    [attempt_id]
  );
  return Number(rows[0].correct);
};

// 회차를 닫는다. 이미 닫힌 회차는 건드리지 않는다(status 조건) — 완료 요청이 두 번 와도
// 첫 결과가 유지되고 점수가 뒤바뀌지 않는다.
const completeAttempt = async (attempt_id, { correct_count, total_quiz_count, score }, executor = pool) => {
  const [result] = await executor.query(
    `UPDATE QuizAttempts
     SET status = 'COMPLETED', correct_count = ?, total_quiz_count = ?, score = ?, completed_at = NOW()
     WHERE id = ? AND status = 'IN_PROGRESS'`,
    [correct_count, total_quiz_count, score, attempt_id]
  );
  return result.affectedRows > 0;
};

// 응시 이력 — 완료된 회차만, 최신순. 진행 중인 회차는 이력이 아니라 내보내지 않는다.
// 주제명을 조인해 함께 준다 — 프론트가 목록마다 주제를 다시 조회하지 않도록.
const findCompletedByUser = async (user_id, { page, limit }, executor = pool) => {
  const [countRows] = await executor.query(
    "SELECT COUNT(*) AS total FROM QuizAttempts WHERE user_id = ? AND status = 'COMPLETED'",
    [user_id]
  );

  const [rows] = await executor.query(
    `SELECT qa.id AS attempt_id, qa.topic_id, t.title AS topic_title,
            qa.correct_count, qa.total_quiz_count, qa.score, qa.completed_at
     FROM QuizAttempts qa
     JOIN Topics t ON t.id = qa.topic_id
     WHERE qa.user_id = ? AND qa.status = 'COMPLETED'
     ORDER BY qa.completed_at DESC, qa.id DESC
     LIMIT ? OFFSET ?`,
    [user_id, limit, (page - 1) * limit]
  );

  return { rows, total: Number(countRows[0].total) };
};

module.exports = {
  findOpenAttemptForUpdate,
  createAttempt,
  countCorrectInAttempt,
  completeAttempt,
  findCompletedByUser,
};
