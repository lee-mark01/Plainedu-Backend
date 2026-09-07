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
const notificationPrefController = require('./notificationPref.controller');
const { updateNotificationPrefsSchema } = require('./notificationPref.validator');

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

// ── 알림 수신 설정 ──
// 프론트 요청서는 /api/me/notification-prefs로 적어왔지만, 운영 계약 문서가 그 경로를
// "복구하면 안 되는 과거 초안"으로 지정하고 도메인 규칙에 맞는 새 계약을 요구한다.
// /me/saved가 도메인별 API로 해체된 것과 같은 맥락이라 users 도메인 아래 /me/agreements 옆에 둔다.
router.get('/me/notification-prefs', authenticate, notificationPrefController.getPrefs);
router.patch(
  '/me/notification-prefs',
  authenticate,
  validate(updateNotificationPrefsSchema),
  notificationPrefController.updatePrefs
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
