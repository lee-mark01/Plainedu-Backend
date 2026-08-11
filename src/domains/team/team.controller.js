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

module.exports = { createTeam, joinTeam, listTeams, getMyTeam, getMyTeamAccount, getMyTeamAccountHistory };
