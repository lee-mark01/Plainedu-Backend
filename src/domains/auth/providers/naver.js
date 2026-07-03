const axios = require('axios');
const AppError = require('../../../errors/AppError');

const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';
const NAVER_USERINFO_URL = 'https://openapi.naver.com/v1/nid/me';

const exchangeCode = async (code, { state } = {}) => {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.NAVER_CLIENT_ID,
    client_secret: process.env.NAVER_CLIENT_SECRET,
    code,
    state: state || '',
  });
  try {
    const { data } = await axios.post(NAVER_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (data.error) {
      console.error('[Naver] token error:', data);
      throw new AppError('네이버 인가 코드가 유효하지 않습니다.', 400);
    }
    return data.access_token;
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[Naver] token error:', err.response?.data);
    throw new AppError('네이버 인가 코드가 유효하지 않습니다.', 400);
  }
};

const getProfile = async (accessToken) => {
  try {
    const { data } = await axios.get(NAVER_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (data.resultcode !== '00' || !data.response) {
      throw new AppError('네이버 사용자 정보를 가져오지 못했습니다.', 502);
    }
    const profile = data.response;
    const snsId = String(profile.id);
    return {
      snsId,
      email: profile.email || `naver_${snsId}@noemail.local`,
      nickname: profile.nickname || `네이버유저_${snsId.slice(-6)}`,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('네이버 사용자 정보를 가져오지 못했습니다.', 502);
  }
};

module.exports = { exchangeCode, getProfile };
