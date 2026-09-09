const teamService = require('./team.service');
const accountService = require('../account/account.service');
const { buildAccountSummary } = require('../account/account.controller');

const createTeam = async (req, res, next) => {
  try {
    const user_id = req.user.userId;
    const { name, max_member_count, position } = req.validated;
    const team = await teamService.createTeam(user_id, name, max_member_count, position);
    res.status(201).json({ success: true, data: team });
  } catch (err) {
    next(err);
  }
};

const joinTeam = async (req, res, next) => {
  try {
    const user_id = req.user.userId;
    const { join_code, position } = req.validated;
    const team = await teamService.joinTeam(user_id, join_code, position);
    res.json({ success: true, data: team });
  } catch (err) {
    next(err);
  }
};

const listTeams = async (req, res, next) => {
  try {
    const user_id = req.user.userId;
    const teams = await teamService.listTeams(user_id, req.validated);
    res.json({ success: true, data: teams });
  } catch (err) {
    next(err);
  }
};

const getMyTeam = async (req, res, next) => {
  try {
    const user_id = req.user.userId;
    const team = await teamService.getMyTeam(user_id);
    res.json({ success: true, data: team });
  } catch (err) {
    next(err);
  }
};

// GET /api/teams/me/account — 팀 계좌 요약 + 보유 (TH-01/TT-01). 응답 형태는 /accounts/me와 동일
const getMyTeamAccount = async (req, res, next) => {
  try {
    const account = await teamService.resolveMyTeamAccount(req.user.userId);
    res.json({ success: true, data: await buildAccountSummary(account) });
  } catch (err) {
    next(err);
  }
};

// GET /api/teams/me/account/history — 팀 성과 추이 그래프 (TH-01)
const getMyTeamAccountHistory = async (req, res, next) => {
  try {
    const account = await teamService.resolveMyTeamAccount(req.user.userId);
    res.json({ success: true, data: await accountService.getAssetHistory(account) });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/teams/me/members/:userId/role — 팀원 역할·포지션 변경 (요청 26)
const updateMemberRole = async (req, res, next) => {
  try {
    // validate 미들웨어가 params·body를 req.validated 하나로 합쳐준다.
    const { userId, role, position } = req.validated;
    const team = await teamService.updateMemberRole(req.user.userId, userId, { role, position });
    res.json({ success: true, data: team });
  } catch (err) {
    next(err);
  }
};

// GET /api/teams/me/rules — 팀 규칙 조회 (요청 31). 규칙이 없으면 content null + version 0.
const getRules = async (req, res, next) => {
  try {
    res.json({ success: true, data: await teamService.getRules(req.user.userId) });
  } catch (err) {
    next(err);
  }
};

// PUT /api/teams/me/rules — 팀 규칙 저장 (요청 32). 팀장만, version 불일치면 409.
const saveRules = async (req, res, next) => {
  try {
    const { content, version } = req.validated;
    const rules = await teamService.saveRules(req.user.userId, content, version);
    res.json({ success: true, data: rules });
  } catch (err) {
    next(err);
  }
};

// GET /api/teams/me/exit-options — 탈퇴 가능 조건 (요청 27)
const getExitOptions = async (req, res, next) => {
  try {
    res.json({ success: true, data: await teamService.getExitOptions(req.user.userId) });
  } catch (err) {
    next(err);
  }
};

// POST /api/teams/me/leave — 탈퇴 (요청 28). 팀장이면 자동 위임, 혼자면 자동 해체.
const leaveTeam = async (req, res, next) => {
  try {
    res.json({ success: true, data: await teamService.leaveTeam(req.user.userId) });
  } catch (err) {
    next(err);
  }
};

// POST /api/teams/me/delegate-and-leave — 지정 위임 후 탈퇴 (요청 29)
const delegateAndLeave = async (req, res, next) => {
  try {
    const result = await teamService.delegateAndLeave(req.user.userId, req.validated.user_id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/teams/me — 팀 해체 (요청 30). 팀장만.
const disbandTeam = async (req, res, next) => {
  try {
    res.json({ success: true, data: await teamService.disbandTeam(req.user.userId) });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createTeam,
  joinTeam,
  listTeams,
  getMyTeam,
  getMyTeamAccount,
  getMyTeamAccountHistory,
  updateMemberRole,
  getRules,
  saveRules,
  getExitOptions,
  leaveTeam,
  delegateAndLeave,
  disbandTeam,
};
