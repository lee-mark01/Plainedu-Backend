const teamOrderService = require('./teamOrder.service');

// TO-01: 실행 대기열
const getQueue = async (req, res, next) => {
  try {
    const data = await teamOrderService.getExecutionQueue(req.user.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// TO-02: 주문 실행
const placeTeamOrder = async (req, res, next) => {
  try {
    const data = await teamOrderService.placeTeamOrder(req.user.userId, req.validated);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// TO-03: 체결·이력
const listTeamOrders = async (req, res, next) => {
  try {
    const data = await teamOrderService.listTeamOrders(req.user.userId, req.validated);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getQueue, placeTeamOrder, listTeamOrders };
