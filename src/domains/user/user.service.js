const userRepository = require('./user.repository');
const rankingService = require('../ranking/ranking.service');
const AppError = require('../../errors/AppError');

const getUsers = async () => {
  return await userRepository.findAll();
};

// PM-01: 마이페이지 프로필 조회
const getMyProfile = async (userId) => {
  const profile = await userRepository.findProfileById(userId);
  if (!profile) throw new AppError('사용자를 찾을 수 없습니다.', 404);

  const totalAsset = profile.total_equity ? Number(profile.total_equity) : null;
  const initialCash = profile.initial_cash ? Number(profile.initial_cash) : null;
  const returnRate = profile.current_return_rate ? Number(profile.current_return_rate) : null;
  const returnAmount = totalAsset && initialCash ? totalAsset - initialCash : null;

  // ranking 도메인에서 개인 순위 조회 (Redis 미계산·학교 미설정 시 null)
  let leagueRank = null;
  try {
    const ranking = await rankingService.getMyRankingSummary(userId);
    if (ranking.individual) {
      leagueRank = ranking.individual.rank;
    }
  } catch {
    // ranking 조회 실패 시 null 유지 (서비스 장애가 프로필 조회를 막지 않도록)
  }

  return {
    id: profile.id,
    email: profile.email,
    nickname: profile.nickname,
    role: profile.role,
    position: profile.position,
    provider: profile.provider,
    school: profile.school_id
      ? { id: profile.school_id, name: profile.school_name, is_verified: Boolean(profile.school_is_verified) }
      : null,
    team: profile.team_id
      ? { id: profile.team_id, name: profile.team_name, role: profile.team_role }
      : null,
    streak: {
      consecutive_days: profile.consecutive_days || 0,
      total_learning_days: profile.total_learning_days || 0,
    },
    points: profile.current_points,
    league_rank: leagueRank,
    asset: totalAsset !== null
      ? { total_equity: totalAsset, return_rate: returnRate, return_amount: returnAmount }
      : null,
    created_at: profile.created_at,
  };
};

// PM-03: 프로필 편집
const updateMyProfile = async (userId, { nickname }) => {
  const user = await userRepository.findById(userId);
  if (!user) throw new AppError('사용자를 찾을 수 없습니다.', 404);

  if (nickname) {
    await userRepository.updateNickname(userId, nickname);
  }

  return userRepository.findById(userId);
};

// AUTH-14: 회원 탈퇴
const deleteMyAccount = async (userId) => {
  const user = await userRepository.findById(userId);
  if (!user) throw new AppError('사용자를 찾을 수 없습니다.', 404);

  await userRepository.deleteUser(userId);
};

module.exports = {
  getUsers, getMyProfile, updateMyProfile, deleteMyAccount,
};
