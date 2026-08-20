const userRepository = require('./user.repository');
const rankingService = require('../ranking/ranking.service');
const teamRepository = require('../team/team.repository');
const schoolRepository = require('../school/school.repository');
const agreementService = require('./agreement.service');
const accountService = require('../account/account.service');
const AppError = require('../../errors/AppError');

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

  // 온보딩 판정(약관 -> 학교 -> 이메일 인증 -> 팀)이 이 응답 하나로 끝나야 하므로 여기서 합친다.
  const agreements = await agreementService.getAgreements(userId);

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
    agreements,
    phone: profile.phone
      ? { number: profile.phone, is_verified: Boolean(profile.phone_verified_at) }
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

// PM-03: 프로필 편집 (+ PM-04/AUTH-07의 학교 선택)
//
// 학교 선택 → 이메일 인증 순서다. 여기서는 school_id만 정하고 school_is_verified는 끈 채로 둔다
// (userRepository.updateSchool이 한 문장으로 처리) → 이어서 POST /api/auth/email/send·verify로 인증.
// 학교를 다시 고르면 같은 흐름을 그대로 반복한다.
//
// 알려진 한계: 인증 메일 도메인이 선택한 학교와 같은 곳인지는 대조하지 않는다
// (도메인 목록이 학교 매핑 없는 평면 allow-list라 대조할 근거가 없음 — 기획 확인 후 별건).
const updateMyProfile = async (userId, { nickname, school_id: schoolId }) => {
  const user = await userRepository.findById(userId);
  if (!user) throw new AppError('사용자를 찾을 수 없습니다.', 404);

  if (nickname) {
    await userRepository.updateNickname(userId, nickname);
  }

  if (schoolId !== undefined && schoolId !== user.school_id) {
    // 팀은 학교 단위로 묶여 있다(team.service.js:47의 팀-유저 학교 일치 요구). 소속된 채로 바꾸면
    // 팀과 학교가 어긋나고 랭킹 집계도 갈라진다.
    // ponytail: 팀 탈퇴 API가 생기면 "탈퇴 후 변경"으로 자연히 풀린다.
    const membership = await teamRepository.findMembershipByUserId(userId);
    if (membership) {
      throw new AppError('팀에 소속된 상태에서는 학교를 변경할 수 없습니다.', 409);
    }

    // FK에 맡기면 없는 학교일 때 500이 난다 — 400/404로 잡아준다.
    const school = await schoolRepository.findById(schoolId);
    if (!school) throw new AppError('존재하지 않는 학교입니다.', 404);

    await userRepository.updateSchool(userId, schoolId);
    await accountService.syncIndividualAccountSchoolGroup(userId, schoolId);
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
  getMyProfile, updateMyProfile, deleteMyAccount,
};
