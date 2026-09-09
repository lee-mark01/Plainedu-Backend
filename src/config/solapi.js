const crypto = require('crypto');
const axios = require('axios');

// Solapi 문자 발송. 공식 SDK 대신 axios + HMAC 서명을 직접 쓴다 —
// 카카오/네이버/구글 provider와 같은 방식이고, 의존성 없이 요청 형태가 그대로 보인다.
const SEND_URL = 'https://api.solapi.com/messages/v4/send';

// Authorization: HMAC-SHA256 apiKey=..., date=..., salt=..., signature=HMAC(date+salt, secret)
const buildAuthHeader = () => {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString('hex');
  const signature = crypto
    .createHmac('sha256', process.env.SOLAPI_API_SECRET)
    .update(date + salt)
    .digest('hex');

  return `HMAC-SHA256 apiKey=${process.env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
};

// 실패 시 throw. 호출부가 사용자용 메시지로 변환한다 (Solapi 응답을 그대로 노출하지 않는다).
const sendSms = async (to, text) => {
  const { data } = await axios.post(
    SEND_URL,
    { message: { to, from: process.env.SOLAPI_SENDER_PHONE, text } },
    { headers: { Authorization: buildAuthHeader(), 'Content-Type': 'application/json' } }
  );

  // 2xx로 와도 건별로 실패할 수 있다 (발신번호 미등록, 잔액 부족 등).
  // failedMessageList가 비어있지 않으면 실제로 안 나간 것이다.
  if (data?.failedMessageList?.length) {
    const first = data.failedMessageList[0];
    throw new Error(`Solapi 발송 실패: ${first.statusCode} ${first.statusMessage}`);
  }
  return data;
};

module.exports = { sendSms };
