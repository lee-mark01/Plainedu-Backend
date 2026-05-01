// TODO: 서비스 구현
const communityRepository = require('./community.repository');

const createPost = async (user_id, post_type, stock_code, opinion, title, content) => {
  return await communityRepository.save(user_id, post_type, stock_code, opinion, title, content);
};

module.exports = { createPost };