const signalsService = require('./signals.service');

// GET /api/stocks/signals — 투자 신호 (요청 16)
const getSignals = async (req, res, next) => {
  try {
    res.json({ success: true, data: await signalsService.getSignals() });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSignals };
