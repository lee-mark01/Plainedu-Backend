const hotRepository = require('./hot.repository');

const getHotStocks = async (limit, qaSessionId) => {
  return await hotRepository.findHotStocks(limit, qaSessionId);
};

const getPopularPosts = async (limit, qaSessionId) => {
  return await hotRepository.findPopularPosts(limit, qaSessionId);
};

module.exports = { getHotStocks, getPopularPosts };
