const express = require('express');
const router = express.Router();
const learningController = require('./learning.controller');
const authMiddleware = require('../../middlewares/authMiddleware');
const validate = require('../../middlewares/validate');
const {
  quizAnswerSchema,
  quizIdSchema,
  attendanceQuerySchema,
  topicIdSchema,
  shortformIdSchema,
  topicsQuerySchema,
} = require('./learning.validator');

// 모든 학습 API는 로그인 필수
router.use(authMiddleware);

// 1. 학습 메인 (주제 목록 + 진행현황 + 오늘의 플로우 + 레벨)
router.get(
  '/topics',
  validate(topicsQuerySchema, 'query'),
  learningController.getTopics
);

// 2. 숏폼 목록 (좋아요/저장/완료 상태 포함)
router.get(
  '/topics/:topicId/shortforms',
  validate(topicIdSchema, 'params'),
  learningController.getShortforms
);

// 3. 숏폼 시청 완료
router.post(
  '/shortforms/:shortformId/complete',
  validate(shortformIdSchema, 'params'),
  learningController.completeShortform
);

// 4. 숏폼 좋아요 토글
router.patch(
  '/shortforms/:shortformId/like',
  validate(shortformIdSchema, 'params'),
  learningController.toggleLike
);

// 5. 숏폼 저장 토글
router.patch(
  '/shortforms/:shortformId/save',
  validate(shortformIdSchema, 'params'),
  learningController.toggleSave
);

// 6. 퀴즈 문제 조회
router.get(
  '/topics/:topicId/quizzes',
  validate(topicIdSchema, 'params'),
  learningController.getQuizzes
);

// 7-1. 퀴즈 단건 채점 (1문제 풀이 후 즉시 채점)
router.post(
  '/quizzes/:quizId/answer',
  validate(quizIdSchema, 'params'),
  validate(quizAnswerSchema, 'body'),
  learningController.submitQuizAnswer
);

// 7-2. 퀴즈 세션 완료 (모든 문제 풀이 후 결과 페이지)
router.post(
  '/topics/:topicId/quizzes/complete',
  validate(topicIdSchema, 'params'),
  learningController.completeQuiz
);

// 8-1. 출석 체크인 (학습 메인 진입 또는 명시적 트리거)
router.post('/attendance/check-in', learningController.checkIn);

// 8-2. 최근 7일 출석 + 연속학습일 (칭찬 화면용)
router.get('/attendance/streak', learningController.getStreak);

// 8. 월별 출석 조회
router.get(
  '/attendance',
  validate(attendanceQuerySchema, 'query'),
  learningController.getAttendance
);

module.exports = router;
