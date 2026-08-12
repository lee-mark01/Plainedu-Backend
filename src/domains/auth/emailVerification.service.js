const crypto = require('crypto');
const redis = require('../../config/redis');
const mailer = require('../../config/mailer');
const { isUniversityEmail } = require('../../data/universityEmailDomains');
const userRepository = require('../user/user.repository');
const AppError = require('../../errors/AppError');

const CODE_TTL = 300; // 5분
const REDIS_PREFIX = 'email_verify:';

const sendVerificationCode = async (userId, email) => {
  if (!isUniversityEmail(email)) {
    throw new AppError('대학교 이메일 주소가 아닙니다.', 400, 'INVALID_UNIVERSITY_EMAIL');
  }

  const code = crypto.randomInt(100000, 999999).toString();

  await redis.set(`${REDIS_PREFIX}${email}`, code, 'EX', CODE_TTL);

  await mailer.sendMail({
    from: `"Plainedu" <${process.env.SMTP_USER}>`,
    to: email,
    subject: '[Plainedu] 대학교 이메일 인증코드',
    text: `인증코드: ${code}\n\n5분 이내에 입력해주세요.`,
    html: `<p>인증코드: <strong>${code}</strong></p><p>5분 이내에 입력해주세요.</p>`,
  });
};

const verifyCode = async (userId, email, code) => {
  const stored = await redis.get(`${REDIS_PREFIX}${email}`);

  if (!stored) {
    throw new AppError('인증코드가 만료되었거나 존재하지 않습니다.', 400, 'CODE_EXPIRED');
  }
  if (stored !== code) {
    throw new AppError('인증코드가 일치하지 않습니다.', 400, 'CODE_MISMATCH');
  }

  await redis.del(`${REDIS_PREFIX}${email}`);
  await userRepository.updateSchoolVerified(userId, true);
};

module.exports = { sendVerificationCode, verifyCode };
