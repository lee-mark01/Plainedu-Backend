// TODO: 서비스 구현
const AppError = require('../../errors/AppError');
const communityRepository = require('./community.repository');
const stockService = require('../stock/stock.service');

// 게시글 생성
const createPost = async (user_id, post_type, stock_code, opinion, title, content) => {
  const id = await communityRepository.save(user_id, post_type, stock_code, opinion, title, content);
  return await communityRepository.findById(id);
};

// 게시글 수정
const updatePost = async (postId, userId, updateData) => {
  const post = await communityRepository.findById(postId);
  if (!post) {
    throw new AppError('Post not found', 404);
  }
  if (post.user_id !== userId) {
    throw new AppError('Forbidden', 403);
  }
  await communityRepository.update(postId, updateData);
  return await communityRepository.findById(postId);
};

// 게시글 삭제
const deletePost = async (postId, userId) => {
  const post = await communityRepository.findById(postId);
  if (!post) {
    throw new AppError('Post not found', 404);
  }
  if (post.user_id !== userId) {
    throw new AppError('Forbidden', 403);
  }
  await communityRepository.softDelete(postId);
};

// 단일 게시글 조회
const getPostById = async (id) => {
  const post = await communityRepository.findById(id);
  if (!post) {
    throw new AppError('Post not found', 404);
  }
  return post;
};

// cursor 기반 페이지네이션 posts + hasNext(다음 페이지 존재 여부)
const getPostsByCursor = async ({ cursor, limit, post_type, stock_code, keyword, search_type, user_id }) => {
  const posts = await communityRepository.findByCursor({ cursor, limit: limit+1, post_type, stock_code, keyword, search_type, user_id } ); // 다음 페이지 존재 여부 확인 위해 limit+1개 조회
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