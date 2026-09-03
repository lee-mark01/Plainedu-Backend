const AppError = require('../../errors/AppError');
const followRepository = require('./follow.repository');

// 팔로우 / 언팔로우 토글
const toggleFollow = async (follower_id, followee_id) => {
  if (follower_id === followee_id) {
    throw new AppError('Cannot follow yourself', 400);
  }

  const existing = await followRepository.findFollow(follower_id, followee_id);
  if (existing) {
    await followRepository.deleteFollow(follower_id, followee_id);
    return { followed: false };
  }
  await followRepository.insertFollow(follower_id, followee_id);
  return { followed: true };
};

// 팔로워 수 / 팔로잉 수
const getFollowCounts = async (user_id) => {
  const [followerCount, followingCount] = await Promise.all([
    followRepository.countFollowers(user_id),
    followRepository.countFollowings(user_id)
  ]);
  return { followerCount, followingCount };
};

// 팔로워 목록
const getFollowers = async (user_id, viewer_id) => {
  return await followRepository.findFollowers(user_id, viewer_id);
};

// 팔로잉 목록
const getFollowings = async (user_id, viewer_id) => {
  return await followRepository.findFollowings(user_id, viewer_id);
};

module.exports = { toggleFollow, getFollowCounts, getFollowers, getFollowings };
