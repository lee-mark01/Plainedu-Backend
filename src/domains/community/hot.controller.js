const hotService = require('./hot.service');

const getHotStocks = async (req, res, next) => {
  try {
    const { limit } = req.validated;
    const stocks = await hotService.getHotStocks(limit);
    res.status(200).json({ success: true, data: stocks });
  } catch (err) {
    next(err);
  }
};

const getPopularPosts = async (req, res, next) => {
  try {
    const { limit } = req.validated;
    const posts = await hotService.getPopularPosts(limit, req.user?.userId);
    res.status(200).json({ success: true, data: posts });
  } catch (err) {
    next(err);
  }
};

module.exports = { getHotStocks, getPopularPosts };
