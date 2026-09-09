const joinRequestService = require('./joinRequest.service');
const invitationService = require('./invitation.service');

// GET /api/teams/me/invitations — 초대 코드 조회 (요청 22)
const getInvitation = async (req, res, next) => {
  try {
    res.json({ success: true, data: await invitationService.getInvitation(req.user.userId) });
  } catch (err) {
    next(err);
  }
};

// POST /api/teams/me/invitations — 초대 코드 재발급 (요청 23)
const reissueInvitation = async (req, res, next) => {
  try {
    res.json({ success: true, data: await invitationService.reissueInvitation(req.user.userId) });
  } catch (err) {
    next(err);
  }
};

// GET /api/teams/me/join-requests — 가입 신청 목록 (요청 24). 팀장만.
const getJoinRequests = async (req, res, next) => {
  try {
    const data = await joinRequestService.getJoinRequests(req.user.userId, req.validated);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// POST /api/teams/me/join-requests — 승인·거절 (요청 25). 팀장만.
const decideJoinRequest = async (req, res, next) => {
  try {
    const { request_id, decision } = req.validated;
    const data = await joinRequestService.decideJoinRequest(req.user.userId, request_id, decision);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getInvitation, reissueInvitation, getJoinRequests, decideJoinRequest };
