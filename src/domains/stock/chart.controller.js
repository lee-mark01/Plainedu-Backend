const chartService = require('./chart.service');

// GET /api/stocks/:symbol/chart?range=1D&before=
const getChart = async (req, res, next) => {
  try {
    const { symbol, range, before } = req.validated;
    const data = await chartService.getChart(symbol, range, before);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/stocks/:symbol/quote — 헤더 초기값/새로고침용 (실시간 갱신은 Socket.IO)
const getQuote = async (req, res, next) => {
  try {
    const { symbol } = req.validated;
    const data = await chartService.getQuote(symbol);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getChart, getQuote };
