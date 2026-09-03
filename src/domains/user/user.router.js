const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const attendanceController = require('./attendance.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const { attendanceQuerySchema } = require('./attendance.validator');
const { updateProfileSchema } = require('./user.validator');
const agreementController = require('./agreement.controller');
const { agreementsSchema } = require('./agreement.validator');

// 예시: GET /api/users
router.get('/', userController.getUsers);

// ── 마이페이지 (PM-01, PM-03, AUTH-14) ──
router.get('/me', authenticate, userController.getMe);
router.patch('/me', authenticate, validate(updateProfileSchema), userController.updateMe);
router.delete('/me', authenticate, userController.deleteMe);

// ── 약관/개인정보/마케팅 동의 (온보딩 1단계 + 마이페이지 설정 공용) ──
// 조회는 GET /users/me의 agreements 필드가 담당한다 — 온보딩 진행 판정이 한 번의 호출로 끝나야 해서다.
router.patch(
  '/me/agreements',
  authenticate,
  validate(agreementsSchema),
  agreementController.patchAgreements
);

// ── 출석 ──
router.post('/attendance/check-in', authenticate, attendanceController.checkIn);
router.get('/attendance/streak', authenticate, attendanceController.getStreak);
router.get(
  '/attendance',
  authenticate,
  validate(attendanceQuerySchema, 'query'),
  attendanceController.getAttendance
);

module.exports = router;
