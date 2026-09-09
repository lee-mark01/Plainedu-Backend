const AppError = require('../../errors/AppError');
const teamRepository = require('./team.repository');

// 초대 코드 조회·재발급 (요청 22, 23)
//
// 승인제에서 코드는 "즉시 가입 열쇠"가 아니라 "신청 관문"이다. 그래도 유출되면 스팸 신청이
// 들어오므로 재발급이 필요하다 — 지금까지 코드는 팀 생성 시 한 번 만들어지고 영구 고정이었다.
//
// 만료 시각을 두지 않은 이유: 요청서가 "만료 여부"를 원하는데, 시간 만료를 넣으면 팀장이
// 모르는 사이 코드가 죽어 신입이 못 들어온다. 재발급이 곧 이전 코드의 만료이므로
// is_expired는 항상 false로 내리고, 실제 만료는 재발급으로 표현한다.

const requireLeader = async (userId) => {
  const membership = await teamRepository.findMembershipByUserId(userId);
  if (!membership) {
    throw new AppError('소속된 팀이 없습니다.', 403, 'NO_TEAM');
  }
  if (membership.role !== 'LEADER') {
    throw new AppError('팀장만 초대 코드를 다룰 수 있습니다.', 403, 'NOT_TEAM_LEADER');
  }
  return membership;
};

const toResponse = (team, joinCode) => ({
  team_id: team.id,
  join_code: joinCode,
  // 요청서의 "남은 자리". 정원이 차면 신청 자체가 막히므로 프론트가 미리 안내할 수 있다.
  remaining_slots: Math.max(team.max_member_count - team.current_member_count, 0),
  max_member_count: team.max_member_count,
  current_member_count: team.current_member_count,
  is_expired: false,
});

const getInvitation = async (userId) => {
  const membership = await requireLeader(userId);
  const team = await teamRepository.findById(membership.team_id);
  return toResponse(team, team.join_code);
};

const reissueInvitation = async (userId) => {
  const membership = await requireLeader(userId);
  const joinCode = await teamRepository.rotateJoinCode(membership.team_id);
  const team = await teamRepository.findById(membership.team_id);
  return toResponse(team, joinCode);
};

module.exports = { getInvitation, reissueInvitation };
