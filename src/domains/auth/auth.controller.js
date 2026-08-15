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
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const { accessToken, refreshToken, user, isNew } = await authService.oauthLogin('kakao', code, {
      ipAddress,
      userAgent,
    });

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: { accessToken, refreshToken, user },
    });
  } catch (err) {
    next(err);
  }
};

const naverLogin = async (req, res, next) => {
  try {
    const code = req.body?.code || req.query.code;
    const state = req.body?.state || req.query.state;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const { accessToken, refreshToken, user, isNew } = await authService.oauthLogin('naver', code, {
      ipAddress,
      userAgent,
      state,
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
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    const { accessToken, refreshToken, user, isNew } = await authService.oauthLogin('google', code, {
      ipAddress,
      userAgent,
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
