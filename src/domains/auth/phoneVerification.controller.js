const phoneVerificationService = require('./phoneVerification.service');

const sendCode = async (req, res, next) => {
  try {
    const result = await phoneVerificationService.sendVerificationCode(
      req.user.userId,
      req.validated.phone
    );
    res.json({ success: true, message: '인증번호를 발송했습니다.', data: result });
  } catch (err) {
    next(err);
  }
};

const verifyCode = async (req, res, next) => {
  try {
    const { phone, code } = req.validated;
    await phoneVerificationService.verifyCode(req.user.userId, phone, code);
    res.json({ success: true, message: '휴대폰 인증이 완료되었습니다.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { sendCode, verifyCode };
