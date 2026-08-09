const stockService = require('./stock.service');

// GET /api/stocks/search — 종목 검색 (검색바)
const searchStocks = async (req, res, next) => {
  try {
    const { keyword, limit } = req.validated;
    const stocks = await stockService.searchStocks(keyword, limit);
    res.json({ success: true, data: stocks });
  } catch (err) {
    next(err);
  }
};

// GET /api/stocks/watchlist — 내 관심종목 목록 (현재가 포함)
const getWatchlist = async (req, res, next) => {
  try {
    const items = await stockService.getWatchlist(req.user.userId);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

// POST /api/stocks/watchlist — 관심종목 등록
const addWatchlist = async (req, res, next) => {
  try {
    const data = await stockService.addToWatchlist(req.user.userId, req.validated.stock_code);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/stocks/watchlist/:stock_code — 관심종목 해제
const removeWatchlist = async (req, res, next) => {
  try {
    const data = await stockService.removeFromWatchlist(req.user.userId, req.validated.stock_code);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { searchStocks, getWatchlist, addWatchlist, removeWatchlist };
