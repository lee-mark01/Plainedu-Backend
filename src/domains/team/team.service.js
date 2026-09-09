const AppError = require('../../errors/AppError');
const { withTransaction } = require('../../config/db');
const teamRepository = require('./team.repository');
const userRepository = require('../user/user.repository');
const schoolRepository = require('../school/school.repository');
const accountService = require('../account/account.service');
const joinRequestService = require('./joinRequest.service');

// 팀 소속 확인 헬퍼 — portfolio/teamOrder 등 "팀원만 접근 가능"한 기능들이 공유
const requireTeamMembership = async (userId) => {
  const membership = await teamRepository.findMembershipByUserId(userId);
  if (!membership) throw new AppError('소속된 팀이 없습니다.', 403);
  return membership;
};

const assertTeamSchoolEligibility = (user, school) => {
  if (!user?.school_id || !school) {
    throw new AppError('학교 선택이 필요합니다.', 403);
  }
  // 대학은 학교 이메일 인증을 요구한다. 고교 SMS 인증은 별도 백로그이므로
  // 현재는 커리어넷 학교 선택을 기준으로 팀 온보딩을 허용한다.
  if (school.school_group !== 'HIGH_SCHOOL' && !user.school_is_verified) {
    throw new AppError('학교 인증이 필요합니다.', 403);
  }
};

const requireTeamSchoolEligibility = async (user) => {
  const school = user?.school_id ? await schoolRepository.findById(user.school_id) : null;
  assertTeamSchoolEligibility(user, school);
  return school;
};

const createTeam = async (user_id, name, max_member_count, position) => {
  const user = await userRepository.findById(user_id);
  await requireTeamSchoolEligibility(user);

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

// 가입 신청 (2026-09-09 정책 변경). 코드가 맞아도 바로 들어가지 않고 팀장 승인을 기다린다.
// 검증·정책은 joinRequest.service가 갖는다 — 여기서는 얇게 위임만 한다.
//
// ⚠️ 응답이 바뀌었다. 이전에는 팀 정보(멤버 포함)를 돌려줘 "가입 완료"를 뜻했고,
// 이제는 { request_id, status: PENDING, team }으로 "신청 접수"를 뜻한다.
const joinTeam = async (user_id, join_code, position) =>
  joinRequestService.requestJoin(user_id, join_code, position);

const listTeams = async (user_id, { keyword, limit }) => {
  const user = await userRepository.findById(user_id);
  await requireTeamSchoolEligibility(user);

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

// =============================================================================
// 팀원 역할·포지션 변경 (요청 26)
// =============================================================================

// 팀장만 호출할 수 있고, 팀장 자리를 비우는 변경은 막는다.
// role을 LEADER로 올리는 건 곧 위임이라 현 팀장이 같은 트랜잭션에서 MEMBER로 내려간다 —
// 두 UPDATE 사이에 끊기면 팀장이 둘이거나 없는 팀이 생긴다.
const updateMemberRole = async (actorId, targetUserId, { role, position }) => {
  return withTransaction(async (conn) => {
    const membership = await teamRepository.findMembershipByUserId(actorId);
    if (!membership) throw new AppError('소속된 팀이 없습니다.', 403);

    const members = await teamRepository.findMembersForUpdate(membership.team_id, conn);
    const actor = members.find((m) => m.user_id === actorId);
    const target = members.find((m) => m.user_id === targetUserId);

    if (actor?.role !== 'LEADER') {
      throw new AppError('팀장만 팀원의 역할을 변경할 수 있습니다.', 403, 'NOT_TEAM_LEADER');
    }
    if (!target) {
      throw new AppError('같은 팀의 팀원이 아닙니다.', 404, 'MEMBER_NOT_FOUND');
    }

    if (role && role !== target.role) {
      if (role === 'LEADER') {
        // 위임: 대상을 올리고 나를 내린다.
        await teamRepository.updateMemberRole(membership.team_id, targetUserId, 'LEADER', conn);
        await teamRepository.updateMemberRole(membership.team_id, actorId, 'MEMBER', conn);
      } else if (targetUserId === actorId) {
        // 마지막 팀장이 스스로 내려오면 팀장 0명이 된다. 넘길 사람을 지정해야 한다.
        throw new AppError(
          '팀장을 다른 팀원에게 위임한 뒤에 역할을 바꿀 수 있습니다.',
          409,
          'LAST_LEADER'
        );
      } else {
        await teamRepository.updateMemberRole(membership.team_id, targetUserId, 'MEMBER', conn);
      }
    }

    if (position) {
      await userRepository.updatePosition(targetUserId, position, conn);
    }

    const team = await teamRepository.findById(membership.team_id);
    const updatedMembers = await teamRepository.findMembersByTeamId(membership.team_id);
    return { ...team, members: updatedMembers };
  });
};

// =============================================================================
// 팀 규칙 (요청 31, 32)
// =============================================================================

// 규칙이 없는 팀은 content null / version 0으로 응답한다. 프론트는 이 상태에서 작성 안내를
// 띄우고, 저장할 때 받은 version을 그대로 돌려보내면 된다(첫 저장은 0).
const getRules = async (userId) => {
  const membership = await requireTeamMembership(userId);
  const rules = await teamRepository.findRulesByTeamId(membership.team_id);

  if (!rules) {
    return {
      team_id: membership.team_id,
      content: null,
      version: 0,
      updated_at: null,
      updated_by: null,
      can_edit: membership.role === 'LEADER',
    };
  }

  return {
    team_id: membership.team_id,
    content: rules.content,
    version: rules.version,
    updated_at: rules.updated_at,
    updated_by: rules.updated_by
      ? { id: rules.updated_by, nickname: rules.updated_by_nickname }
      : null,
    can_edit: membership.role === 'LEADER',
  };
};

const saveRules = async (userId, content, version) => {
  const membership = await requireTeamMembership(userId);
  if (membership.role !== 'LEADER') {
    throw new AppError('팀장만 팀 규칙을 수정할 수 있습니다.', 403, 'NOT_TEAM_LEADER');
  }

  const saved = await teamRepository.saveRules(membership.team_id, content, version, userId);
  if (!saved) {
    // 내가 읽은 뒤에 누군가 먼저 저장했다. 자유 텍스트라 병합할 수 없으니 다시 읽게 한다.
    throw new AppError(
      '다른 팀원이 먼저 규칙을 수정했습니다. 최신 내용을 확인한 뒤 다시 저장해주세요.',
      409,
      'RULES_VERSION_CONFLICT'
    );
  }

  return getRules(userId);
};

// =============================================================================
// 탈퇴·해체 (요청 27~30)
// =============================================================================

// 팀에서 빠질 때 되돌려야 하는 개인 상태. position은 Users 컬럼이라 팀 FK CASCADE 밖에 있어
// 손으로 지우지 않으면 팀 없는 유저가 TRADER로 남고 다음 팀 가입 때 포지션 선택이 꼬인다.
const clearMembershipSideEffects = async (userId, conn) => {
  await userRepository.updatePosition(userId, 'NONE', conn);
};

// 탈퇴 화면이 무엇을 보여줄지 결정하는 순수 로직 (요청 27).
// DB에서 떼어낸 이유: 여기 담긴 게 정책 그 자체라 조회 없이 검증할 수 있어야 한다.
//
// 정책 (2026-09-03 결정)
//   - 탈퇴는 언제나 가능하다. 팀장이라고 막지 않는다.
//   - 팀장이 나가면 서버가 가장 오래된 팀원에게 자동 위임한다.
//   - 팀장이 혼자면 나가는 순간 팀이 해체된다.
const buildExitOptions = (teamId, role, userId, members) => {
  const isLeader = role === 'LEADER';
  const others = members.filter((m) => m.user_id !== userId);
  const soleMember = others.length === 0;

  return {
    team_id: teamId,
    role,
    member_count: members.length,
    can_leave: true,
    leave_effect: soleMember ? 'DISBAND' : isLeader ? 'AUTO_DELEGATE' : 'LEAVE',
    // 넘길 사람을 직접 고르고 싶을 때만 쓴다. 팀장이 아니거나 혼자면 고를 대상이 없다.
    can_delegate: isLeader && !soleMember,
    can_disband: isLeader,
    delegatable_members: isLeader
      ? others.map((m) => ({ user_id: m.user_id, nickname: m.nickname, joined_at: m.joined_at }))
      : [],
    // 불가능한 이유를 문장으로 준다 — 프론트가 조건식을 다시 짜지 않도록.
    reasons: {
      delegate: isLeader
        ? soleMember
          ? '팀에 다른 팀원이 없습니다.'
          : null
        : '팀장만 위임할 수 있습니다.',
      disband: isLeader ? null : '팀장만 팀을 해체할 수 있습니다.',
    },
  };
};

const getExitOptions = async (userId) => {
  const membership = await requireTeamMembership(userId);
  const members = await teamRepository.findMembersByTeamId(membership.team_id);
  return buildExitOptions(membership.team_id, membership.role, userId, members);
};

// 팀장이 나갈 때 넘겨받을 사람. 가장 먼저 들어온 팀원이며, joined_at이 같으면 user_id가 작은 쪽.
// findMembersForUpdate가 이미 그 순서로 정렬해 잠그므로 여기서는 첫 타인을 고르면 된다.
const pickSuccessor = (members, leavingUserId) =>
  members.find((m) => m.user_id !== leavingUserId) || null;

// 탈퇴 한 번으로 상황에 맞게 갈린다 (결정: 팀장은 자동 위임, 혼자면 자동 해체).
// 어느 경로든 하나의 트랜잭션 — 위임만 되고 탈퇴가 안 되는 중간 상태를 만들지 않는다.
const leaveTeam = async (userId) => {
  return withTransaction(async (conn) => {
    const membership = await teamRepository.findMembershipByUserId(userId);
    if (!membership) throw new AppError('소속된 팀이 없습니다.', 403);

    const members = await teamRepository.findMembersForUpdate(membership.team_id, conn);
    const me = members.find((m) => m.user_id === userId);
    const successor = pickSuccessor(members, userId);

    // 혼자 남은 팀은 나가는 순간 빈 팀이 된다. 빈 팀을 남기면 이름·가입코드만 점유한다.
    if (!successor) {
      await teamRepository.deleteTeam(membership.team_id, conn);
      await clearMembershipSideEffects(userId, conn);
      return { result: 'DISBANDED', team_id: membership.team_id, new_leader: null };
    }

    if (me?.role === 'LEADER') {
      await teamRepository.updateMemberRole(membership.team_id, successor.user_id, 'LEADER', conn);
    }
    await teamRepository.removeMember(membership.team_id, userId, conn);
    await clearMembershipSideEffects(userId, conn);

    return {
      result: me?.role === 'LEADER' ? 'DELEGATED_AND_LEFT' : 'LEFT',
      team_id: membership.team_id,
      new_leader: me?.role === 'LEADER' ? { user_id: successor.user_id } : null,
    };
  });
};

// 넘길 사람을 직접 고르는 경로 (요청 29). 자동 위임과 달리 대상 검증이 필요하다.
const delegateAndLeave = async (userId, successorUserId) => {
  return withTransaction(async (conn) => {
    const membership = await teamRepository.findMembershipByUserId(userId);
    if (!membership) throw new AppError('소속된 팀이 없습니다.', 403);

    const members = await teamRepository.findMembersForUpdate(membership.team_id, conn);
    const me = members.find((m) => m.user_id === userId);
    if (me?.role !== 'LEADER') {
      throw new AppError('팀장만 위임할 수 있습니다.', 403, 'NOT_TEAM_LEADER');
    }
    if (successorUserId === userId) {
      throw new AppError('자기 자신에게 위임할 수 없습니다.', 400, 'INVALID_SUCCESSOR');
    }
    const successor = members.find((m) => m.user_id === successorUserId);
    if (!successor) {
      throw new AppError('같은 팀의 팀원이 아닙니다.', 404, 'MEMBER_NOT_FOUND');
    }

    await teamRepository.updateMemberRole(membership.team_id, successorUserId, 'LEADER', conn);
    await teamRepository.removeMember(membership.team_id, userId, conn);
    await clearMembershipSideEffects(userId, conn);

    return {
      result: 'DELEGATED_AND_LEFT',
      team_id: membership.team_id,
      new_leader: { user_id: successorUserId },
    };
  });
};

// 팀 해체 (요청 30). Teams 한 줄 삭제로 멤버·포트폴리오·팀 계좌·주문·보유가 CASCADE로 사라진다.
// 남는 것은 DailyRankings의 과거 순위 기록뿐이고, 그건 의도적으로 보존한다 —
// 확정 시점의 팀 이름을 target_name에 스냅샷해두어 팀이 없어도 과거 순위표가 읽힌다.
//
// PENDING 지정가 주문은 별도로 정리하지 않는다. 체결 엔진이 틱마다 DB를 조회하는 구조라
// 주문 행이 사라지면 자연히 대상에서 빠진다(메모리 레지스트리 없음).
const disbandTeam = async (userId) => {
  return withTransaction(async (conn) => {
    const membership = await teamRepository.findMembershipByUserId(userId);
    if (!membership) throw new AppError('소속된 팀이 없습니다.', 403);

    const members = await teamRepository.findMembersForUpdate(membership.team_id, conn);
    const me = members.find((m) => m.user_id === userId);
    if (me?.role !== 'LEADER') {
      throw new AppError('팀장만 팀을 해체할 수 있습니다.', 403, 'NOT_TEAM_LEADER');
    }

    await teamRepository.deleteTeam(membership.team_id, conn);
    // 남은 팀원 전원의 포지션도 되돌린다 — 팀이 사라졌는데 TRADER로 남으면 안 된다.
    for (const m of members) {
      await clearMembershipSideEffects(m.user_id, conn);
    }

    return { result: 'DISBANDED', team_id: membership.team_id, removed_members: members.length };
  });
};

module.exports = {
  createTeam,
  joinTeam,
  listTeams,
  getMyTeam,
  requireTeamMembership,
  resolveMyTeamAccount,
  assertTeamSchoolEligibility,
  updateMemberRole,
  getRules,
  saveRules,
  getExitOptions,
  leaveTeam,
  delegateAndLeave,
  disbandTeam,
  // 정책 판정 순수 함수 — 테스트가 DB 없이 검증한다.
  buildExitOptions,
  pickSuccessor,
};
