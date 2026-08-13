const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const attendanceController = require('./attendance.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const { attendanceQuerySchema } = require('./attendance.validator');
const { updateProfileSchema } = require('./user.validator');

// ── 마이페이지 (PM-01, PM-03, AUTH-14) ──
router.get('/me', authenticate, userController.getMe);
router.patch('/me', authenticate, validate(updateProfileSchema), userController.updateMe);
router.delete('/me', authenticate, userController.deleteMe);

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
