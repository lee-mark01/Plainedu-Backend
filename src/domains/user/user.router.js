const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const attendanceController = require('./attendance.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const { attendanceQuerySchema } = require('./attendance.validator');

// 예시: GET /api/users
router.get('/', userController.getUsers);

// 출석 체크인 (앱 접속 시 프론트가 명시적으로 호출)
router.post('/attendance/check-in', authenticate, attendanceController.checkIn);

// 이번 주(월~일) 출석 + 연속학습일 (칭찬 화면용)
router.get('/attendance/streak', authenticate, attendanceController.getStreak);

// 월별 출석 조회
router.get(
  '/attendance',
  authenticate,
  validate(attendanceQuerySchema, 'query'),
  attendanceController.getAttendance
);

module.exports = router;
