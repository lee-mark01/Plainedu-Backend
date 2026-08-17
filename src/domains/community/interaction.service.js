const AppError = require('../../errors/AppError');
const interactionRepository = require('./interaction.repository');
const postRepository = require('./post.repository');
const commentRepository = require('./comment.repository');

// 게시글 좋아요 토글
const togglePostLike = async (user_id, post_id, qaSessionId) => {
  const post = await postRepository.findById(post_id, qaSessionId);
  if (!post) throw new AppError('Post not found', 404);

  const existing = await interactionRepository.findPostLike(user_id, post_id);
  if (existing) {
    await interactionRepository.deletePostLike(user_id, post_id);
    return { liked: false };
  }
  await interactionRepository.insertPostLike(user_id, post_id);
  return { liked: true };
};

// 댓글 좋아요 토글
const toggleCommentLike = async (user_id, comment_id, qaSessionId) => {
  const comment = await commentRepository.findById(comment_id);
  if (!comment || !(await postRepository.findById(comment.post_id, qaSessionId))) throw new AppError('Comment not found', 404);

  const existing = await interactionRepository.findCommentLike(user_id, comment_id);
  if (existing) {
    await interactionRepository.deleteCommentLike(user_id, comment_id);
    return { liked: false };
  }
  await interactionRepository.insertCommentLike(user_id, comment_id);
  return { liked: true };
};

// 스크랩 토글
const toggleBookmark = async (user_id, post_id, qaSessionId) => {
  const post = await postRepository.findById(post_id, qaSessionId);
  if (!post) throw new AppError('Post not found', 404);

  const existing = await interactionRepository.findBookmark(user_id, post_id);
  if (existing) {
    await interactionRepository.deleteBookmark(user_id, post_id);
    return { bookmarked: false };
  }
  await interactionRepository.insertBookmark(user_id, post_id);
  return { bookmarked: true };
};

// 조회수 기록
const recordPostView = async (user_id, post_id, qaSessionId) => {
  const post = await postRepository.findById(post_id, qaSessionId);
  if (!post) throw new AppError('Post not found', 404);

  const existing = await interactionRepository.findPostView(user_id, post_id);
  if (!existing) {
    await interactionRepository.insertPostView(user_id, post_id);
  }
};

// PM-02: 내 스크랩 목록
const getBookmarkedPosts = async (user_id) => {
  return interactionRepository.findBookmarkedPosts(user_id);
};

module.exports = { togglePostLike, toggleCommentLike, toggleBookmark, recordPostView, getBookmarkedPosts };
