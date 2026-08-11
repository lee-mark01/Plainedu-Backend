const learningService = require('./learning.service');

// 1. 학습 메인 (주제 목록 + 진행현황 + 오늘의 플로우 + 레벨)
const getTopics = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { level } = req.validated;  // validator가 default 1 적용 + number 변환 (req.query는 문자열이라 기본값 안 먹음)
    const result = await learningService.getTopicsWithProgress(userId, level);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// 2. 숏폼 목록 (좋아요/저장/완료 상태 포함)
const getShortforms = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { topicId } = req.params;
    const result = await learningService.getShortformsByTopic(userId, Number(topicId));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// 3. 숏폼 시청 완료
const completeShortform = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { shortformId } = req.params;
    await learningService.completeShortform(userId, Number(shortformId));

    res.status(200).json({
      success: true,
      message: '시청 완료 처리되었습니다.',
    });
  } catch (error) {
    next(error);
  }
};

// 4. 숏폼 좋아요 토글
const toggleLike = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { shortformId } = req.params;
    const result = await learningService.toggleLike(userId, Number(shortformId));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// 5. 숏폼 저장 토글
const toggleSave = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { shortformId } = req.params;
    const result = await learningService.toggleSave(userId, Number(shortformId));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// 6. 퀴즈 문제 조회
const getQuizzes = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { topicId } = req.params;
    const result = await learningService.getQuizzesByTopic(userId, Number(topicId));

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// 7-1. 퀴즈 단건 채점 (1문제 풀이 후 즉시 채점)
const submitQuizAnswer = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { quizId } = req.params;
    const { answer } = req.body;
    const result = await learningService.submitQuizAnswer(userId, Number(quizId), answer);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// 7-2. 퀴즈 세션 완료 (결과 페이지용)
const completeQuiz = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { topicId } = req.params;
    const result = await learningService.completeQuizSession(userId, topicId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTopics,
  getShortforms,
  completeShortform,
  toggleLike,
  toggleSave,
  getQuizzes,
  submitQuizAnswer,
  completeQuiz,
};
