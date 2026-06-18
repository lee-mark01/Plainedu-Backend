const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');

router.post('/kakao', authController.kakaoLogin);
router.post('/naver', authController.naverLogin);
router.post('/google', authController.googleLogin);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

module.exports = router;
