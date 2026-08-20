const authService = require('./auth.service');
const authRepository = require('./auth.repository');
const accountService = require('../account/account.service');
const tokenTools = require('../../utils/jwt');
const { verifyFirebaseIdToken } = require('./firebaseToken.verifier');
const { createFirebaseTokenService } = require('./firebaseToken.service');

const firebaseTokenService = createFirebaseTokenService({
  repository: authRepository,
  accountService,
  tokenTools,
});

const kakaoLogin = async (req, res, next) => {
  try {
    const code = req.body?.code || req.query.code;
    const redirectUri = req.body?.redirect_uri || req.query.redirect_uri;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const { accessToken, refreshToken, user, isNew } = await authService.oauthLogin('kakao', code, {
      ipAddress,
      userAgent,
      redirectUri,
    });

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: { accessToken, refreshToken, user },
    });
  } catch (err) {
    next(err);
  }
};

// 네이버는 교환 때 redirect_uri를 요구하지 않는다(state로 검증). 그래도 컨트롤러에서는 셋 다 똑같이
// 넘긴다 - 여기만 예외를 두면 "왜 네이버만 다르지"가 생기고, 네이버 정책이 바뀌면 놓친다.
// 실제 사용 여부는 각 provider가 판단한다.
const naverLogin = async (req, res, next) => {
  try {
    const code = req.body?.code || req.query.code;
    const state = req.body?.state || req.query.state;
    const redirectUri = req.body?.redirect_uri || req.query.redirect_uri;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const { accessToken, refreshToken, user, isNew } = await authService.oauthLogin('naver', code, {
      ipAddress,
      userAgent,
      state,
      redirectUri,
    });

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: { accessToken, refreshToken, user },
    });
  } catch (err) {
    next(err);
  }
};

const googleLogin = async (req, res, next) => {
  try {
    const code = req.body?.code || req.query.code;
    const redirectUri = req.body?.redirect_uri || req.query.redirect_uri;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const { accessToken, refreshToken, user, isNew } = await authService.oauthLogin('google', code, {
      ipAddress,
      userAgent,
      redirectUri,
    });

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: { accessToken, refreshToken, user },
    });
  } catch (err) {
    next(err);
  }
};

const firebaseTokenLogin = async (req, res, next) => {
  try {
    const decodedToken = await verifyFirebaseIdToken(req.body?.idToken);
    const { accessToken, refreshToken, user, isNew } = await firebaseTokenService.exchange(decodedToken, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: { accessToken, refreshToken, user },
    });
  } catch (err) {
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    const { accessToken, refreshToken: newRefreshToken } = await authService.refresh(refreshToken, { ipAddress, userAgent });
    res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { kakaoLogin, naverLogin, googleLogin, firebaseTokenLogin, refresh, logout };
