const axios = require('axios');
const AppError = require('../../../errors/AppError');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// 카카오와 동일하게 인가/교환의 redirect_uri가 일치해야 한다 (kakao.js 주석 참조).
const exchangeCode = async (code, { redirectUri } = {}) => {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri || process.env.GOOGLE_REDIRECT_URI,
    code,
  });
  try {
    const { data } = await axios.post(GOOGLE_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return data.access_token;
  } catch (err) {
    console.error('[Google] token error:', err.response?.data);
    throw new AppError('구글 인가 코드가 유효하지 않습니다.', 400);
  }
};

const getProfile = async (accessToken) => {
  try {
    const { data } = await axios.get(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const snsId = String(data.id);
    return {
      snsId,
      email: data.email || `google_${snsId}@noemail.local`,
      nickname: data.name || `구글유저_${snsId.slice(-6)}`,
    };
  } catch {
    throw new AppError('구글 사용자 정보를 가져오지 못했습니다.', 502);
  }
};

module.exports = { exchangeCode, getProfile };
