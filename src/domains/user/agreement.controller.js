const agreementService = require('./agreement.service');

// 약관/개인정보/마케팅 동의 제출·변경 (온보딩 2단계 + 마이페이지 설정 공용)
const patchAgreements = async (req, res, next) => {
  try {
    const agreements = await agreementService.saveAgreements(req.user.userId, req.validated);
    res.json({ success: true, data: { agreements } });
  } catch (err) {
    next(err);
  }
};

module.exports = { patchAgreements };
