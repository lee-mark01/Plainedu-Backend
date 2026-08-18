const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const emailVerificationController = require('./emailVerification.controller');
const { sendCodeSchema, verifyCodeSchema } = require('./emailVerification.validator');
const mainQaController = require('../mainQa/mainQa.controller');
const { mainQaLoginSchema } = require('../mainQa/mainQa.validator');
const rateLimit = require('../../middlewares/rateLimit');
const requireMainQaEnabled = require('../mainQa/mainQa.available');

router.post('/kakao', authController.kakaoLogin);
router.post('/naver', authController.naverLogin);
router.post('/google', authController.googleLogin);
router.post('/firebase-token', authController.firebaseTokenLogin);
router.post(
  '/qa-session',
  requireMainQaEnabled,
  rateLimit('main-qa-pin', 50, 900),
  validate(mainQaLoginSchema),
  mainQaController.login
);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

// 대학교 이메일 인증
router.post('/email/send', authenticate, validate(sendCodeSchema), emailVerificationController.sendCode);
router.post('/email/verify', authenticate, validate(verifyCodeSchema), emailVerificationController.verifyCode);

module.exports = router;
