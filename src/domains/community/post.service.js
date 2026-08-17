const AppError = require('../../errors/AppError');
const communityRepository = require('./post.repository');
const stockService = require('../stock/stock.service');
const notificationService = require('./notification.service');
const followRepository = require('./follow.repository');

// 게시글 생성
const createPost = async (user_id, post_type, stock_code, opinion, title, content, qaSessionId) => {
  const id = await communityRepository.save(user_id, post_type, stock_code, opinion, title, content, qaSessionId);
  const post = await communityRepository.findById(id, qaSessionId);

  // 팔로워들에게 알림 발송
  const followers = await followRepository.findFollowers(user_id, qaSessionId);
  for (const follower of followers) {
    await notificationService.createNotification(
      follower.id, user_id, 'FOLLOWEE_POST', id, title
    );
  }

  return post;
};

// 게시글 수정
const updatePost = async (post_id, user_id, updateData, qaSessionId) => {
  const post = await communityRepository.findById(post_id, qaSessionId);
  if (!post) {
    throw new AppError('Post not found', 404);
  }
  if (post.user_id !== user_id) {
    throw new AppError('Forbidden', 403);
  }
  await communityRepository.update(post_id, updateData);
  return await communityRepository.findById(post_id, qaSessionId);
};

// 게시글 삭제
const deletePost = async (post_id, user_id, qaSessionId) => {
  const post = await communityRepository.findById(post_id, qaSessionId);
  if (!post) {
    throw new AppError('Post not found', 404);
  }
  if (post.user_id !== user_id) {
    throw new AppError('Forbidden', 403);
  }
  await communityRepository.softDelete(post_id);
};

// 단일 게시글 조회
const getPostById = async (post_id, qaSessionId) => {
  const post = await communityRepository.findById(post_id, qaSessionId);
  if (!post) {
    throw new AppError('Post not found', 404);
  }
  return post;
};

// cursor 기반 페이지네이션 posts + hasNext(다음 페이지 존재 여부)
const getPostsByCursor = async ({ cursor, limit, post_type, stock_code, keyword, search_type, user_id, qaSessionId }) => {
  const posts = await communityRepository.findByCursor({ cursor, limit: limit+1, post_type, stock_code, keyword, search_type, user_id, qaSessionId } ); // 다음 페이지 존재 여부 확인 위해 limit+1개 조회
  const hasNext = posts.length === limit+1; // limit+1개 조회됐으면 다음 페이지 존재
  if (hasNext) {
    posts.pop(); // 다음 페이지 존재 여부 확인 위해 조회한 마지막 게시글 제거
  }
  return { posts, hasNext };
};

// 종목 검색
const searchStocks = async (keyword, limit) => {
  return await stockService.searchStocks(keyword, limit);
};

module.exports = { createPost, getPostById, getPostsByCursor, updatePost, deletePost, searchStocks };
