const followService = require('./follow.service');

// 팔로우 / 언팔로우 토글
const toggleFollow = async (req, res, next) => {
  try {
    const followee_id = Number(req.params.user_id);
    const follower_id = req.user.userId;
    const result = await followService.toggleFollow(follower_id, followee_id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// 팔로워 수 / 팔로잉 수
const getFollowCounts = async (req, res, next) => {
  try {
    const user_id = Number(req.params.user_id);
    const result = await followService.getFollowCounts(user_id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// 팔로워 목록
const getFollowers = async (req, res, next) => {
  try {
    const user_id = Number(req.params.user_id);
    const followers = await followService.getFollowers(user_id);
    res.status(200).json({ success: true, data: followers });
  } catch (err) {
    next(err);
  }
};

// 팔로잉 목록
const getFollowings = async (req, res, next) => {
  try {
    const user_id = Number(req.params.user_id);
    const followings = await followService.getFollowings(user_id);
    res.status(200).json({ success: true, data: followings });
  } catch (err) {
    next(err);
  }
};

module.exports = { toggleFollow, getFollowCounts, getFollowers, getFollowings };
