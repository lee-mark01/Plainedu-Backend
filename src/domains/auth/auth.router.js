const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const rateLimit = require('../../middlewares/rateLimit');
const emailVerificationController = require('./emailVerification.controller');
const { sendCodeSchema, verifyCodeSchema } = require('./emailVerification.validator');
const phoneVerificationController = require('./phoneVerification.controller');
const { sendPhoneCodeSchema, verifyPhoneCodeSchema } = require('./phoneVerification.validator');

// app.js의 OAuth 리다이렉트 콜백(GET)도 같은 컨트롤러라 거기에도 같은 리미터를 건다.
const loginLimit = rateLimit('login', 60, 300);

router.post('/kakao', loginLimit, authController.kakaoLogin);
router.post('/naver', loginLimit, authController.naverLogin);
router.post('/google', loginLimit, authController.googleLogin);
router.post('/firebase-token', loginLimit, authController.firebaseTokenLogin);
router.post('/refresh', rateLimit('refresh', 60, 300), authController.refresh);
router.post('/logout', authController.logout);

// 대학교 이메일 인증
// send: 메일이 실제로 나가므로 유저당 시간당 3통. 없으면 계정 하나로 임의의 주소에 무제한 발송이
//       가능해 제3자 메일 폭탄 + SMTP 계정 정지로 이어진다.
// verify: 6자리 코드(TTL 5분) 무한 대입을 막는다. 5분당 10회.
router.post('/email/send', authenticate, rateLimit('email-send', 3, 3600), validate(sendCodeSchema), emailVerificationController.sendCode);
router.post('/email/verify', authenticate, rateLimit('email-verify', 10, 300), validate(verifyCodeSchema), emailVerificationController.verifyCode);

// 휴대폰 인증 (Solapi SMS)
// send: 문자는 건당 과금이라 메일보다 빡세게 잡는다. 유저당 시간당 3통 + 서비스단 30초 쿨다운.
//       리밋만으로는 연타를 못 막고, 연타 한 번이 그대로 비용이다.
// verify: 6자리 코드(TTL 3분) 무차별 대입 차단. 5분당 10회.
router.post('/phone/send', authenticate, rateLimit('phone-send', 3, 3600), validate(sendPhoneCodeSchema), phoneVerificationController.sendCode);
router.post('/phone/verify', authenticate, rateLimit('phone-verify', 10, 300), validate(verifyPhoneCodeSchema), phoneVerificationController.verifyCode);

module.exports = router;
