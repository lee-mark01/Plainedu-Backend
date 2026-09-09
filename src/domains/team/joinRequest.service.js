const AppError = require('../../errors/AppError');
const { withTransaction } = require('../../config/db');
const teamRepository = require('./team.repository');
const joinRequestRepository = require('./joinRequest.repository');
const userRepository = require('../user/user.repository');
const schoolRepository = require('../school/school.repository');
const notificationService = require('../community/notification.service');

// 가입 신청 (요청 22~25 정책, 2026-09-09 결정)
//
// 코드를 맞게 입력하면 **신청**이 되고 팀장이 승인해야 들어간다. 코드만으로 즉시 가입하던
// 이전 동작을 대체한다 — POST /api/teams/join의 응답이 팀 정보에서 신청 결과로 바뀐다.
//
// 정책 다섯 가지:
//   ① 정원이 찬 팀에는 신청할 수 없다 (승인될 수 없는 신청을 받으면 헛된 대기가 생긴다)
//   ② 대기 중 신청은 하나만 — 새로 신청하면 기존 건을 CANCELED로 돌린다
//   ③ 같은 팀에 중복 신청 불가
//   ④ 거절 후 재신청 가능 (쿨다운 없음)
//   ⑤ 신청 시 팀장에게 알림

// 팀 온보딩 자격은 팀 생성과 같은 규칙을 쓴다 (대학은 이메일 인증, 고교는 학교 선택).
const requireEligibleUser = async (userId) => {
  const user = await userRepository.findById(userId);
  const school = user?.school_id ? await schoolRepository.findById(user.school_id) : null;
  if (!user?.school_id || !school) {
    throw new AppError('학교 선택이 필요합니다.', 403);
  }
  if (school.school_group !== 'HIGH_SCHOOL' && !user.school_is_verified) {
    throw new AppError('학교 인증이 필요합니다.', 403);
  }
  return user;
};

const requestJoin = async (userId, joinCode, position) => {
  const user = await requireEligibleUser(userId);

  // 이미 팀에 속해 있으면 신청할 이유가 없다. TeamMembers가 UNIQUE(user_id)라
  // 승인 시점에도 어차피 막히지만, 여기서 걸러 사용자에게 이유를 분명히 알린다.
  if (await teamRepository.findMembershipByUserId(userId)) {
    throw new AppError('이미 팀에 소속되어 있습니다.', 409, 'ALREADY_IN_TEAM');
  }

  const team = await teamRepository.findByJoinCode(joinCode);
  if (!team) {
    throw new AppError('유효하지 않은 가입 코드입니다.', 404, 'INVALID_JOIN_CODE');
  }
  if (team.school_id !== user.school_id) {
    throw new AppError('같은 학교의 팀에만 신청할 수 있습니다.', 403, 'SCHOOL_MISMATCH');
  }
  // ① 정원이 찬 팀
  if (team.current_member_count >= team.max_member_count) {
    throw new AppError('팀 인원이 가득 찼습니다.', 409, 'TEAM_FULL');
  }

  const requestId = await withTransaction(async (conn) => {
    // ②③ 대기 신청은 하나만. 잠근 뒤 판단해야 동시 요청이 둘 다 통과하지 않는다.
    const pending = await joinRequestRepository.findPendingByUserForUpdate(userId, conn);

    if (pending.some((p) => p.team_id === team.id)) {
      throw new AppError('이미 이 팀에 가입 신청했습니다.', 409, 'ALREADY_REQUESTED');
    }
    // 다른 팀에 대기 중인 신청은 취소한다 — 두 팀장이 동시에 승인하는 경쟁을 없앤다.
    await joinRequestRepository.cancelPending(pending.map((p) => p.id), conn);

    return joinRequestRepository.createRequest(team.id, userId, position, conn);
  });

  // ⑤ 팀장 알림. 실패해도 신청 자체는 유효해야 하므로 트랜잭션 밖에서 보내고 예외를 삼킨다.
  await notifyLeader(team, userId, user.nickname, requestId);

  return {
    request_id: requestId,
    status: 'PENDING',
    team: { id: team.id, name: team.name },
  };
};

const notifyLeader = async (team, applicantId, applicantNickname, requestId) => {
  try {
    const leaderId = await teamRepository.findLeaderUserId(team.id);
    if (!leaderId) return;
    await notificationService.createNotification(
      leaderId,
      applicantId,
      'TEAM_JOIN_REQUEST',
      requestId,
      `${applicantNickname}님이 ${team.name} 팀에 가입을 신청했습니다.`
    );
  } catch (err) {
    console.error('[joinRequest] 팀장 알림 실패(무시):', err.message);
  }
};

// 팀장만 볼 수 있다. 대기 건이 먼저, 그다음 최근 처리 순.
const getJoinRequests = async (userId, { status, page, limit }) => {
  const membership = await teamRepository.findMembershipByUserId(userId);
  if (!membership) throw new AppError('소속된 팀이 없습니다.', 403);
  if (membership.role !== 'LEADER') {
    throw new AppError('팀장만 가입 신청을 볼 수 있습니다.', 403, 'NOT_TEAM_LEADER');
  }

  const { rows, total } = await joinRequestRepository.findByTeam(membership.team_id, {
    status,
    page,
    limit,
  });

  return {
    requests: rows.map((r) => ({
      request_id: r.request_id,
      user_id: r.user_id,
      nickname: r.nickname,
      position: r.position,
      status: r.status,
      created_at: r.created_at,
      processed_at: r.processed_at,
    })),
    pagination: { page, limit, total },
  };
};

// 승인·거절. 한 트랜잭션이라 "신청은 승인됐는데 멤버 등록은 실패"가 생기지 않는다.
const decideJoinRequest = async (userId, requestId, decision) => {
  const membership = await teamRepository.findMembershipByUserId(userId);
  if (!membership) throw new AppError('소속된 팀이 없습니다.', 403);
  if (membership.role !== 'LEADER') {
    throw new AppError('팀장만 가입 신청을 처리할 수 있습니다.', 403, 'NOT_TEAM_LEADER');
  }

  return withTransaction(async (conn) => {
    const request = await joinRequestRepository.findByIdForUpdate(requestId, conn);
    if (!request || request.team_id !== membership.team_id) {
      throw new AppError('가입 신청을 찾을 수 없습니다.', 404, 'REQUEST_NOT_FOUND');
    }
    if (request.status !== 'PENDING') {
      throw new AppError('이미 처리된 신청입니다.', 409, 'REQUEST_ALREADY_PROCESSED');
    }

    if (decision === 'REJECT') {
      await joinRequestRepository.decideRequest(requestId, 'REJECTED', userId, conn);
      return { request_id: requestId, status: 'REJECTED' };
    }

    // 신청 시점과 승인 시점 사이에 상황이 바뀔 수 있어 둘 다 다시 확인한다.
    // 팀을 잠근 채로 읽어야 승인 두 건이 동시에 빈 자리를 보고 통과하지 않는다.
    const team = await teamRepository.findByIdForUpdate(membership.team_id, conn);
    if (team.current_member_count >= team.max_member_count) {
      throw new AppError('팀 인원이 가득 찼습니다.', 409, 'TEAM_FULL');
    }
    // 신청자가 그 사이 다른 팀에 들어갔을 수 있다. TeamMembers UNIQUE(user_id)가 막지만
    // 제약 위반 대신 이유가 분명한 오류를 낸다.
    if (await teamRepository.findMembershipByUserId(request.user_id)) {
      throw new AppError('신청자가 이미 다른 팀에 소속되어 있습니다.', 409, 'APPLICANT_IN_TEAM');
    }

    await joinRequestRepository.decideRequest(requestId, 'APPROVED', userId, conn);
    await teamRepository.addMember(team.id, request.user_id, conn);
    // 포지션은 신청 시 받아둔 값을 적용한다 — 팀장이 대신 고를 수는 없다.
    await userRepository.updatePosition(request.user_id, request.position, conn);

    return { request_id: requestId, status: 'APPROVED', user_id: request.user_id };
  });
};

module.exports = { requestJoin, getJoinRequests, decideJoinRequest };
