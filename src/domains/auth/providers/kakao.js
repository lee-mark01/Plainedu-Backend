const axios = require('axios');
const AppError = require('../../../errors/AppError');

const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const KAKAO_USERINFO_URL = 'https://kapi.kakao.com/v2/user/me';

const exchangeCode = async (code) => {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.KAKAO_CLIENT_ID,
    client_secret: process.env.KAKAO_CLIENT_SECRET,
    redirect_uri: process.env.KAKAO_REDIRECT_URI,
    code,
  });
  try {
    const { data } = await axios.post(KAKAO_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return data.access_token;
  } catch (err) {
    console.error('[Kakao] token error:', err.response?.data);
    throw new AppError('카카오 인가 코드가 유효하지 않습니다.', 400);
  }
};

const getProfile = async (accessToken) => {
  try {
    const { data } = await axios.get(KAKAO_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const snsId = String(data.id);
    const kakaoAccount = data.kakao_account || {};
    if (!kakaoAccount.email) {
      throw new AppError('이메일 제공에 동의해야 로그인할 수 있습니다.', 403, 'EMAIL_REQUIRED');
    }
    return {
      snsId,
      email: kakaoAccount.email,
      nickname: kakaoAccount.profile?.nickname || `카카오유저_${snsId.slice(-6)}`,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('카카오 사용자 정보를 가져오지 못했습니다.', 502);
  }
};

module.exports = { exchangeCode, getProfile };
