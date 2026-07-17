const portfolioService = require('./portfolio.service');

const listPortfolios = async (req, res, next) => {
  try {
    const data = await portfolioService.listPortfolios(req.user.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getActivePortfolio = async (req, res, next) => {
  try {
    const data = await portfolioService.getActivePortfolio(req.user.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getPortfolioDetail = async (req, res, next) => {
  try {
    const data = await portfolioService.getPortfolioDetail(req.user.userId, Number(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const createPortfolio = async (req, res, next) => {
  try {
    const data = await portfolioService.createPortfolio(req.user.userId, req.validated);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const updatePortfolio = async (req, res, next) => {
  try {
    const data = await portfolioService.updatePortfolio(req.user.userId, Number(req.params.id), req.validated);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const deletePortfolio = async (req, res, next) => {
  try {
    const data = await portfolioService.deletePortfolio(req.user.userId, Number(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const submitPortfolio = async (req, res, next) => {
  try {
    const data = await portfolioService.submitPortfolio(req.user.userId, Number(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const vote = async (req, res, next) => {
  try {
    const data = await portfolioService.vote(req.user.userId, Number(req.params.id), req.validated.is_approved);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getVotes = async (req, res, next) => {
  try {
    const data = await portfolioService.getVotes(req.user.userId, Number(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listPortfolios,
  getActivePortfolio,
  getPortfolioDetail,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  submitPortfolio,
  vote,
  getVotes,
};
