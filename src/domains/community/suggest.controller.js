const suggestService = require('./suggest.service');

// GET /api/community/users/suggested — 추천 사용자 (요청 20)
const getSuggestedUsers = async (req, res, next) => {
  try {
    const data = await suggestService.getSuggestedUsers(req.user.userId, req.validated.limit);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSuggestedUsers };
