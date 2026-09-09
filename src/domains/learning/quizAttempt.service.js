const quizAttemptRepository = require('./quizAttempt.repository');

// 응시 이력. 완료된 회차만 최신순으로 내려간다 (요청 21).
//
// 저장된 값을 그대로 준다 — 로그에서 다시 계산하지 않는다. 확정 시점 스냅샷이라
// 나중에 그 주제에 퀴즈가 추가·삭제돼도 과거 회차의 점수가 바뀌지 않는다.
const toResults = (rows) =>
  rows.map((r) => ({
    attempt_id: r.attempt_id,
    topic_id: r.topic_id,
    topic_title: r.topic_title,
    correct_count: Number(r.correct_count),
    total_quiz_count: Number(r.total_quiz_count),
    score: Number(r.score),
    completed_at: r.completed_at,
  }));

const getQuizResults = async (userId, { page, limit }) => {
  const { rows, total } = await quizAttemptRepository.findCompletedByUser(userId, { page, limit });
  return {
    results: toResults(rows),
    pagination: { page, limit, total },
  };
};

module.exports = { getQuizResults, toResults };
