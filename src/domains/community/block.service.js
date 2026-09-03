const AppError = require('../../errors/AppError');
const { withTransaction } = require('../../config/db');
const blockRepository = require('./block.repository');
const followRepository = require('./follow.repository');
const userRepository = require('../user/user.repository');

// 차단하면 서로의 팔로우 관계를 끊는다. 팔로우가 남아 있으면 상대의 활동 알림이 계속 오고,
// 팔로워 수에도 잡혀 "차단했는데 여전히 이어져 있다"는 상태가 된다.
// 차단 등록과 팔로우 해제는 한 트랜잭션이다 — 차단만 되고 팔로우가 남으면 위 상태 그대로다.
const blockUser = async (userId, targetUserId) => {
  if (userId === targetUserId) {
    throw new AppError('자기 자신을 차단할 수 없습니다.', 400, 'CANNOT_BLOCK_SELF');
  }

  const target = await userRepository.findById(targetUserId);
  if (!target) {
    throw new AppError('존재하지 않는 사용자입니다.', 404, 'USER_NOT_FOUND');
  }

  await withTransaction(async (conn) => {
    await blockRepository.insertBlock(userId, targetUserId, conn);
    await followRepository.deleteFollow(userId, targetUserId, conn);
    await followRepository.deleteFollow(targetUserId, userId, conn);
  });

  return { user_id: targetUserId, nickname: target.nickname, is_blocked: true };
};

// 해제는 팔로우를 되살리지 않는다. 차단 전 관계를 복원하려면 무엇을 끊었는지 따로 기록해야 하는데,
// 해제 후 다시 팔로우하는 건 한 번의 동작이라 복원 기록을 남길 만한 가치가 없다.
const unblockUser = async (userId, targetUserId) => {
  const removed = await blockRepository.deleteBlock(userId, targetUserId);
  if (!removed) {
    throw new AppError('차단 목록에 없는 사용자입니다.', 404, 'BLOCK_NOT_FOUND');
  }
  return { user_id: targetUserId, is_blocked: false };
};

const getBlockedUsers = async (userId, { keyword, page, limit }) => {
  const { rows, total } = await blockRepository.findBlockedUsers(userId, { keyword, page, limit });
  return {
    blocks: rows,
    pagination: { page, limit, total },
  };
};

module.exports = { blockUser, unblockUser, getBlockedUsers };
