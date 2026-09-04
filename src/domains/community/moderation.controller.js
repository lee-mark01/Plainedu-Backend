const blockService = require('./block.service');
const reportService = require('./report.service');

// POST /api/community/reports — 게시글·댓글·사용자 신고 (요청 7)
const createReport = async (req, res, next) => {
  try {
    const report = await reportService.createReport(req.user.userId, req.validated);
    res.status(201).json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
};

// GET /api/community/blocks — 차단 목록 (요청 8). 검색 + 페이지네이션.
const getBlockedUsers = async (req, res, next) => {
  try {
    const result = await blockService.getBlockedUsers(req.user.userId, req.validated);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// POST /api/community/blocks — 사용자 차단 (요청 9)
const blockUser = async (req, res, next) => {
  try {
    const result = await blockService.blockUser(req.user.userId, req.validated.user_id);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/community/blocks/:userId — 차단 해제 (요청 10)
const unblockUser = async (req, res, next) => {
  try {
    const result = await blockService.unblockUser(req.user.userId, req.validated.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { createReport, getBlockedUsers, blockUser, unblockUser };
