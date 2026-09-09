const restrictionService = require('./restriction.service');

// GET /api/community/restrictions/me — 내 제한 상태 (요청 33)
const getMyRestriction = async (req, res, next) => {
  try {
    res.json({ success: true, data: await restrictionService.getMyRestriction(req.user.userId) });
  } catch (err) {
    next(err);
  }
};

// GET /api/community/restriction/appeals — 내 이의신청 목록 (요청 11)
const getMyAppeals = async (req, res, next) => {
  try {
    const data = await restrictionService.getMyAppeals(req.user.userId, req.validated);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// POST /api/community/restriction/appeals — 이의신청 제출 (요청 12)
const submitAppeal = async (req, res, next) => {
  try {
    const { restriction_id, content } = req.validated;
    const data = await restrictionService.submitAppeal(req.user.userId, restriction_id, content);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMyRestriction, getMyAppeals, submitAppeal };
