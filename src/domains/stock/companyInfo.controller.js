const companyInfoService = require('./companyInfo.service');

// GET /api/stocks/:symbol/company-info — 기업 정보 (요청 17)
const getCompanyInfo = async (req, res, next) => {
  try {
    res.json({ success: true, data: await companyInfoService.getCompanyInfo(req.validated.symbol) });
  } catch (err) {
    next(err);
  }
};

module.exports = { getCompanyInfo };
