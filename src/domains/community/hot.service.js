const hotRepository = require('./hot.repository');

const getHotStocks = async (limit) => {
  return await hotRepository.findHotStocks(limit);
};

const getPopularPosts = async (limit, viewer_id) => {
  return await hotRepository.findPopularPosts(limit, viewer_id);
};

module.exports = { getHotStocks, getPopularPosts };
