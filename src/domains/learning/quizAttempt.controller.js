const quizAttemptService = require('./quizAttempt.service');

// GET /api/learning/quiz-results — 퀴즈 응시 이력 (요청 21)
const getQuizResults = async (req, res, next) => {
  try {
    const data = await quizAttemptService.getQuizResults(req.user.userId, req.validated);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getQuizResults };
