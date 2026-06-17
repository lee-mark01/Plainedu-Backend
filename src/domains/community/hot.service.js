const hotRepository = require('./hot.repository');

const getHotStocks = async (limit) => {
  return await hotRepository.findHotStocks(limit);
};

const getPopularPosts = async (limit) => {
  return await hotRepository.findPopularPosts(limit);
};

module.exports = { getHotStocks, getPopularPosts };
