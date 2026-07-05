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

module.exports = { searchStocks };
