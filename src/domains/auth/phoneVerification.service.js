const crypto = require('crypto');
const redis = require('../../config/redis');
const solapi = require('../../config/solapi');   // 구조분해하지 않는다 - emailVerification의 mailer와 같은 패턴
const userRepository = require('../user/user.repository');
const AppError = require('../../errors/AppError');

const CODE_PREFIX = 'phone_verify:';
const COOLDOWN_PREFIX = 'phone_resend:';

const codeTtl = () => Number(process.env.PHONE_VERIFY_CODE_TTL_SECONDS) || 180;
const cooldown = () => Number(process.env.PHONE_VERIFY_RESEND_COOLDOWN_SECONDS) || 30;

// 재발송 쿨다운은 레이트리밋과 별개다. 리밋은 "시간당 몇 건"이라 연타를 막지 못하는데,
// SMS는 건당 과금이라 연타 한 번이 그대로 비용이다. 남은 초를 함께 돌려줘 카운트다운을 띄우게 한다.
const sendVerificationCode = async (userId, phone) => {
  const remaining = await redis.ttl(`${COOLDOWN_PREFIX}${phone}`);
  if (remaining > 0) {
    throw new AppError(
      `${remaining}초 후에 다시 시도해주세요.`,
      429,
      'RESEND_COOLDOWN'
    );
  }

  // 이미 다른 계정이 인증을 마친 번호는 발송 전에 막는다 - 문자를 보내고 나서 실패시키면
  // 비용은 나가고 유저는 코드를 받은 채 거절당한다.
  const owner = await userRepository.findVerifiedByPhone(phone);
  if (owner && owner.id !== userId) {
    throw new AppError('이미 다른 계정에서 인증된 번호입니다.', 409, 'PHONE_ALREADY_USED');
  }

  const code = crypto.randomInt(100000, 999999).toString();
  await redis.set(`${CODE_PREFIX}${phone}`, code, 'EX', codeTtl());

  try {
    await solapi.sendSms(phone, `[Plainedu] 인증번호 ${code}\n${Math.floor(codeTtl() / 60)}분 이내에 입력해주세요.`);
  } catch (err) {
    // 발송이 실패했으면 코드도 지운다. 남겨두면 문자를 못 받은 유저가 쿨다운에만 걸린다.
    await redis.del(`${CODE_PREFIX}${phone}`).catch(() => {});
    console.error('[phoneVerify] SMS 발송 실패:', err.message);
    throw new AppError('인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요.', 502, 'SMS_SEND_FAILED');
  }

  await redis.set(`${COOLDOWN_PREFIX}${phone}`, '1', 'EX', cooldown());
  return { cooldown_seconds: cooldown(), expires_in_seconds: codeTtl() };
};

const verifyCode = async (userId, phone, code) => {
  const stored = await redis.get(`${CODE_PREFIX}${phone}`);

  if (!stored) {
    throw new AppError('인증번호가 만료되었거나 존재하지 않습니다.', 400, 'CODE_EXPIRED');
  }
  if (stored !== code) {
    throw new AppError('인증번호가 일치하지 않습니다.', 400, 'CODE_MISMATCH');
  }

  // 발송~검증 사이에 다른 계정이 먼저 인증했을 수 있다 (동시 진행). 저장 직전에 한 번 더 본다.
  const owner = await userRepository.findVerifiedByPhone(phone);
  if (owner && owner.id !== userId) {
    throw new AppError('이미 다른 계정에서 인증된 번호입니다.', 409, 'PHONE_ALREADY_USED');
  }

  await redis.del(`${CODE_PREFIX}${phone}`);
  await userRepository.updatePhoneVerified(userId, phone);
};

module.exports = { sendVerificationCode, verifyCode };
