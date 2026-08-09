const tradingService = require('./trading.service');

const placeOrder = async (req, res, next) => {
  try {
    const data = await tradingService.placeOrder(req.user.userId, req.validated);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const data = await tradingService.cancelOrder(req.user.userId, orderId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { placeOrder, cancelOrder };
