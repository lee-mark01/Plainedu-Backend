// TODO: 서비스 구현
const AppError = require('../../errors/AppError');
const communityRepository = require('./community.repository');

const createPost = async (user_id, post_type, stock_code, opinion, title, content) => {
  const id = await communityRepository.save(user_id, post_type, stock_code, opinion, title, content);
  return await communityRepository.findById(id);
};

const getPostById = async (id) => {
  const post = await communityRepository.findById(id);
  if (!post) {
    throw new AppError('Post not found', 404);
  }
  return post;
};

module.exports = { createPost, getPostById };