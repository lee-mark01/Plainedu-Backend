const AppError = require('../../errors/AppError');
const { withTransaction } = require('../../config/db');
const restrictionRepository = require('./restriction.repository');
const appealRepository = require('./appeal.repository');
const userRepository = require('../user/user.repository');

// 이용 제한과 이의신청 (요청 11, 12, 33 + 관리자 쪽).
//
// 부과 주체는 관리자다. 신고 누적 자동 제재를 넣지 않은 이유: 조직적 신고에 악용될 수 있고,
// 사람이 판단하는 편이 오판이 적다. 신고는 요청 7이 이미 쌓아두고 있다.

const toRestriction = (row) => ({
  restriction_id: row.id,
  type: row.type,
  reason: row.reason,
  detail: row.detail,
  starts_at: row.starts_at,
  ends_at: row.ends_at, // null이면 무기한
  status: row.status,
  // 상태 값만 보면 만료된 건도 ACTIVE로 보인다. 실제로 지금 효력이 있는지를 함께 준다.
  is_effective: Boolean(Number(row.is_effective)),
  created_at: row.created_at,
  lifted_at: row.lifted_at,
});

// 요청 33 — 제한이 없는 경우도 정상 응답이다. 404를 내면 프론트가 오류 처리로 분기하게 된다.
const getMyRestriction = async (userId) => {
  const active = await restrictionRepository.findActiveByUserId(userId);
  const history = await restrictionRepository.findByUserId(userId);

  return {
    is_restricted: Boolean(active),
    current: active
      ? {
          restriction_id: active.id,
          type: active.type,
          reason: active.reason,
          detail: active.detail,
          starts_at: active.starts_at,
          ends_at: active.ends_at,
          // 이의신청은 유효한 제한에만, 그리고 아직 신청하지 않은 건에만 할 수 있다.
          can_appeal: !(await appealRepository.findByRestrictionId(active.id)),
        }
      : null,
    history: history.map(toRestriction),
  };
};

// 요청 12 — 자기 제한에만, 유효한 제한에만, 한 번만 신청할 수 있다.
const submitAppeal = async (userId, restrictionId, content) => {
  const restriction = await restrictionRepository.findActiveByUserId(userId);
  if (!restriction || restriction.id !== restrictionId) {
    // 남의 제한이나 이미 풀린 제한에 신청하려는 경우를 한 메시지로 묶는다 —
    // "그 제한은 존재한다"는 사실 자체를 노출하지 않는다.
    throw new AppError('이의신청할 수 있는 제한이 아닙니다.', 404, 'RESTRICTION_NOT_APPEALABLE');
  }

  const appealId = await appealRepository.insertAppeal({
    restriction_id: restrictionId,
    user_id: userId,
    content,
  });
  if (appealId === null) {
    throw new AppError('이미 이의신청한 제한입니다.', 409, 'ALREADY_APPEALED');
  }

  return { appeal_id: appealId, restriction_id: restrictionId, status: 'RECEIVED' };
};

// 요청 11 — 내 이의신청 목록. 상태와 제출·처리 시각을 담는다.
const getMyAppeals = async (userId, { page, limit }) => {
  const { rows, total } = await appealRepository.findByUserId(userId, { page, limit });
  return {
    appeals: rows.map((r) => ({
      appeal_id: r.appeal_id,
      restriction_id: r.restriction_id,
      restriction_reason: r.restriction_reason,
      content: r.content,
      status: r.status,
      admin_comment: r.admin_comment,
      created_at: r.created_at,
      processed_at: r.processed_at,
    })),
    pagination: { page, limit, total },
  };
};

// ── 관리자 ──

const createRestriction = async (adminId, { user_id, reason, detail, days }) => {
  const target = await userRepository.findById(user_id);
  if (!target) {
    throw new AppError('존재하지 않는 사용자입니다.', 404, 'USER_NOT_FOUND');
  }
  if (target.role === 'ADMIN') {
    throw new AppError('관리자는 제한할 수 없습니다.', 409, 'CANNOT_RESTRICT_ADMIN');
  }
  if (await restrictionRepository.findActiveByUserId(user_id)) {
    throw new AppError('이미 제한 중인 사용자입니다.', 409, 'ALREADY_RESTRICTED');
  }

  // days를 받아 서버가 종료 시각을 계산한다. 클라이언트가 보낸 시각을 그대로 쓰면
  // 시간대 해석이 갈려 의도한 기간과 어긋난다. days 생략은 무기한이다.
  const endsAt = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

  const id = await restrictionRepository.createRestriction({
    user_id,
    reason,
    detail,
    ends_at: endsAt,
    created_by: adminId,
  });

  return { restriction_id: id, user_id, reason, ends_at: endsAt, status: 'ACTIVE' };
};

const liftRestriction = async (adminId, restrictionId) => {
  return withTransaction(async (conn) => {
    const restriction = await restrictionRepository.findByIdForUpdate(restrictionId, conn);
    if (!restriction) {
      throw new AppError('제한을 찾을 수 없습니다.', 404, 'RESTRICTION_NOT_FOUND');
    }
    const lifted = await restrictionRepository.liftRestriction(restrictionId, adminId, conn);
    if (!lifted) {
      throw new AppError('이미 해제된 제한입니다.', 409, 'ALREADY_LIFTED');
    }
    return { restriction_id: restrictionId, status: 'LIFTED' };
  });
};

const listRestrictions = async ({ status, page, limit }) => {
  const { rows, total } = await restrictionRepository.findAllRestrictions({ status, page, limit });
  return {
    restrictions: rows.map((r) => ({ ...toRestriction(r), user_id: r.user_id, nickname: r.nickname })),
    pagination: { page, limit, total },
  };
};

const listAppeals = async ({ status, page, limit }) => {
  const { rows, total } = await appealRepository.findAllAppeals({ status, page, limit });
  return {
    appeals: rows.map((r) => ({
      appeal_id: r.appeal_id,
      restriction_id: r.restriction_id,
      user_id: r.user_id,
      nickname: r.nickname,
      content: r.content,
      status: r.status,
      admin_comment: r.admin_comment,
      restriction_reason: r.restriction_reason,
      restriction_status: r.restriction_status,
      created_at: r.created_at,
      processed_at: r.processed_at,
    })),
    pagination: { page, limit, total },
  };
};

// 승인은 제한 해제까지 함께 한다 — 이의신청을 받아들였는데 제한이 남으면 결정이 무의미하다.
// 한 트랜잭션이라 "승인은 됐는데 여전히 제한 중"이 생기지 않는다.
const decideAppeal = async (adminId, appealId, decision, adminComment) => {
  return withTransaction(async (conn) => {
    const appeal = await appealRepository.findByIdForUpdate(appealId, conn);
    if (!appeal) {
      throw new AppError('이의신청을 찾을 수 없습니다.', 404, 'APPEAL_NOT_FOUND');
    }

    const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const decided = await appealRepository.decideAppeal(appealId, status, adminId, adminComment, conn);
    if (!decided) {
      throw new AppError('이미 처리된 이의신청입니다.', 409, 'APPEAL_ALREADY_PROCESSED');
    }

    if (decision === 'APPROVE') {
      // 이미 해제됐거나 만료된 제한이면 조용히 넘어간다 — 결과가 같다.
      await restrictionRepository.liftRestriction(appeal.restriction_id, adminId, conn);
    }

    return { appeal_id: appealId, status, restriction_id: appeal.restriction_id };
  });
};

module.exports = {
  getMyRestriction,
  submitAppeal,
  getMyAppeals,
  createRestriction,
  liftRestriction,
  listRestrictions,
  listAppeals,
  decideAppeal,
};
