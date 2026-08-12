const emailVerificationService = require('./emailVerification.service');

const sendCode = async (req, res, next) => {
  try {
    const { email } = req.validated;
    await emailVerificationService.sendVerificationCode(req.user.userId, email);
    res.json({ success: true, message: '인증코드가 발송되었습니다.' });
  } catch (err) {
    next(err);
  }
};

const verifyCode = async (req, res, next) => {
  try {
    const { email, code } = req.validated;
    await emailVerificationService.verifyCode(req.user.userId, email, code);
    res.json({ success: true, message: '이메일 인증이 완료되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { sendCode, verifyCode };
