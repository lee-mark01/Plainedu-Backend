const AppError = require('../../errors/AppError');
const teamRepository = require('./team.repository');
const userRepository = require('../user/user.repository');
const accountService = require('../account/account.service');

// 팀 소속 확인 헬퍼 — portfolio/teamOrder 등 "팀원만 접근 가능"한 기능들이 공유
const requireTeamMembership = async (userId) => {
  const membership = await teamRepository.findMembershipByUserId(userId);
  if (!membership) throw new AppError('소속된 팀이 없습니다.', 403);
  return membership;
};

const createTeam = async (user_id, name, max_member_count, position) => {
  const user = await userRepository.findById(user_id);
  if (!user.school_id || !user.school_is_verified) {
    throw new AppError('학교 인증이 필요합니다.', 403);
  }

  const existing = await teamRepository.findMembershipByUserId(user_id);
  if (existing) {
    throw new AppError('이미 팀에 소속되어 있습니다.', 409);
  }

  const team_id = await teamRepository.createTeamWithLeader(user.school_id, name, max_member_count, user_id);
  await accountService.getOrCreateTeamAccount(team_id, user.school_id);
  await userRepository.updatePosition(user_id, position);
  const team = await teamRepository.findById(team_id);
  const members = await teamRepository.findMembersByTeamId(team_id);
  return { ...team, members };
};

const joinTeam = async (user_id, join_code, position) => {
  const user = await userRepository.findById(user_id);
  if (!user.school_id || !user.school_is_verified) {
    throw new AppError('학교 인증이 필요합니다.', 403);
  }

  const existing = await teamRepository.findMembershipByUserId(user_id);
  if (existing) {
    throw new AppError('이미 팀에 소속되어 있습니다.', 409);
  }

  const team = await teamRepository.findByJoinCode(join_code);
  if (!team) {
    throw new AppError('유효하지 않은 가입 코드입니다.', 404);
  }
  if (team.school_id !== user.school_id) {
    throw new AppError('같은 학교의 팀에만 가입할 수 있습니다.', 403);
  }
  if (team.current_member_count >= team.max_member_count) {
    throw new AppError('팀 인원이 가득 찼습니다.', 409);
  }

  await teamRepository.joinTeam(team.id, user_id);
  await userRepository.updatePosition(user_id, position);
  const updated = await teamRepository.findById(team.id);
  const members = await teamRepository.findMembersByTeamId(team.id);
  return { ...updated, members };
};

const listTeams = async (user_id, { keyword, limit }) => {
  const user = await userRepository.findById(user_id);
  if (!user.school_id || !user.school_is_verified) {
    throw new AppError('학교 인증이 필요합니다.', 403);
  }

  return teamRepository.findBySchool({ school_id: user.school_id, keyword, limit });
};

const getMyTeam = async (user_id) => {
  const membership = await teamRepository.findMembershipByUserId(user_id);
  if (!membership) {
    throw new AppError('소속된 팀이 없습니다.', 404);
  }
  const team = await teamRepository.findById(membership.team_id);
  const members = await teamRepository.findMembersByTeamId(membership.team_id);
  return { ...team, members };
};

// 내 팀 계좌 해석 (TH-01/TT-01) — 팀 미소속이면 requireTeamMembership이 403.
// 평가·추이 계산은 전부 account 도메인 소비. 여기서 직접 계산하지 않는다.
const resolveMyTeamAccount = async (user_id) => {
  const membership = await requireTeamMembership(user_id);
  const team = await teamRepository.findById(membership.team_id);
  return accountService.getOrCreateTeamAccount(team.id, team.school_id);
};

module.exports = { createTeam, joinTeam, listTeams, getMyTeam, requireTeamMembership, resolveMyTeamAccount };
