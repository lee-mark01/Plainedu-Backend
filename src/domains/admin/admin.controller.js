const restrictionService = require('../community/restriction.service');
const reportRepository = require('../community/report.repository');

// 관리자 전용. 라우터에 requireAdmin이 걸려 있어 여기서 권한을 다시 확인하지 않는다.
//
// 요청 34건 밖의 엔드포인트다. 제재를 부과하는 주체가 없으면 사용자 쪽 제한 조회·이의신청
// (요청 11·12·33)이 항상 빈 응답이라 함께 만들었다.

// GET /api/admin/reports — 신고 목록 (요청 7이 쌓아둔 것)
const listReports = async (req, res, next) => {
  try {
    const data = await reportRepository.findAllReports(req.validated);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/restrictions — 제재 부과
const createRestriction = async (req, res, next) => {
  try {
    const data = await restrictionService.createRestriction(req.user.userId, req.validated);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/restrictions — 제재 목록
const listRestrictions = async (req, res, next) => {
  try {
    res.json({ success: true, data: await restrictionService.listRestrictions(req.validated) });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/restrictions/:restrictionId — 제재 해제
const liftRestriction = async (req, res, next) => {
  try {
    const data = await restrictionService.liftRestriction(req.user.userId, req.validated.restrictionId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/appeals — 이의신청 목록. 미처리 건이 먼저 온다.
const listAppeals = async (req, res, next) => {
  try {
    res.json({ success: true, data: await restrictionService.listAppeals(req.validated) });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/appeals/:appealId/decision — 이의신청 승인·거절
const decideAppeal = async (req, res, next) => {
  try {
    const { appealId, decision, admin_comment } = req.validated;
    const data = await restrictionService.decideAppeal(req.user.userId, appealId, decision, admin_comment);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listReports,
  createRestriction,
  listRestrictions,
  liftRestriction,
  listAppeals,
  decideAppeal,
};
