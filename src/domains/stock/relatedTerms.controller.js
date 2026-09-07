const relatedTermsService = require('./relatedTerms.service');

// GET /api/stocks/related-terms — 연관 검색어 (요청 19)
const getRelatedTerms = async (req, res, next) => {
  try {
    const { q, limit } = req.validated;
    const data = await relatedTermsService.getRelatedTerms(q, limit);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getRelatedTerms };
