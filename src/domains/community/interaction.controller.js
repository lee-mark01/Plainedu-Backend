const interactionService = require('./interaction.service');

// 게시글 좋아요 토글
const togglePostLike = async (req, res, next) => {
  try {
    const post_id = Number(req.params.post_id);
    const user_id = req.user.userId;
    const result = await interactionService.togglePostLike(user_id, post_id, req.user.qaSessionId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// 댓글 좋아요 토글
const toggleCommentLike = async (req, res, next) => {
  try {
    const comment_id = Number(req.params.comment_id);
    const user_id = req.user.userId;
    const result = await interactionService.toggleCommentLike(user_id, comment_id, req.user.qaSessionId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// 스크랩 토글
const toggleBookmark = async (req, res, next) => {
  try {
    const post_id = Number(req.params.post_id);
    const user_id = req.user.userId;
    const result = await interactionService.toggleBookmark(user_id, post_id, req.user.qaSessionId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// 조회수 기록
const recordPostView = async (req, res, next) => {
  try {
    const post_id = Number(req.params.post_id);
    const user_id = req.user.userId;
    await interactionService.recordPostView(user_id, post_id, req.user.qaSessionId);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// PM-02: 내 스크랩 목록
const getBookmarkedPosts = async (req, res, next) => {
  try {
    const user_id = req.user.userId;
    const posts = await interactionService.getBookmarkedPosts(user_id);
    res.status(200).json({ success: true, data: posts });
  } catch (err) {
    next(err);
  }
};

module.exports = { togglePostLike, toggleCommentLike, toggleBookmark, recordPostView, getBookmarkedPosts };
