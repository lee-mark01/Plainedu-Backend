const authService = require('./auth.service');

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

module.exports = { kakaoLogin, refresh, logout };
