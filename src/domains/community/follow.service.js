const AppError = require('../../errors/AppError');
const followRepository = require('./follow.repository');

const assertScopedUser = async (user_id, qaSessionId) => {
  if (!(await followRepository.findScopedUser(user_id, qaSessionId))) {
    throw new AppError('User not found', 404);
  }
};

// 팔로우 / 언팔로우 토글
const toggleFollow = async (follower_id, followee_id, qaSessionId) => {
  if (follower_id === followee_id) {
    throw new AppError('Cannot follow yourself', 400);
  }
  await assertScopedUser(followee_id, qaSessionId);

  const existing = await followRepository.findFollow(follower_id, followee_id);
  if (existing) {
    await followRepository.deleteFollow(follower_id, followee_id);
    return { followed: false };
  }
  await followRepository.insertFollow(follower_id, followee_id);
  return { followed: true };
};

// 팔로워 수 / 팔로잉 수
const getFollowCounts = async (user_id, qaSessionId) => {
  await assertScopedUser(user_id, qaSessionId);
  const [followerCount, followingCount] = await Promise.all([
    followRepository.countFollowers(user_id),
    followRepository.countFollowings(user_id)
  ]);
  return { followerCount, followingCount };
};

// 팔로워 목록
const getFollowers = async (user_id, qaSessionId) => {
  await assertScopedUser(user_id, qaSessionId);
  return await followRepository.findFollowers(user_id, qaSessionId);
};

// 팔로잉 목록
const getFollowings = async (user_id, qaSessionId) => {
  await assertScopedUser(user_id, qaSessionId);
  return await followRepository.findFollowings(user_id, qaSessionId);
};

module.exports = { toggleFollow, getFollowCounts, getFollowers, getFollowings };
