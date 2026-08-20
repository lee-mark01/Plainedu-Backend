const axios = require('axios');
const AppError = require('../../../errors/AppError');

const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const KAKAO_USERINFO_URL = 'https://kapi.kakao.com/v2/user/me';

// redirectUri: 프론트가 인가 요청에 쓴 콜백 주소.
// 카카오는 인가 때와 교환 때의 redirect_uri가 정확히 같아야 통과시킨다 (인가코드를 탈취당해도
// 다른 곳에서 교환되지 못하게 하는 장치). 인가는 프론트가 자기 주소로 하므로 그 값을 받아 넘긴다.
// 없으면 env 기본값 - app.js의 GET /auth/kakao/callback(브라우저/Swagger 확인용)이 그 경로다.
const exchangeCode = async (code, { redirectUri } = {}) => {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.KAKAO_CLIENT_ID,
    client_secret: process.env.KAKAO_CLIENT_SECRET,
    redirect_uri: redirectUri || process.env.KAKAO_REDIRECT_URI,
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
