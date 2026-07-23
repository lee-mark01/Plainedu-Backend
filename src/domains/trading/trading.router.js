const express = require('express');
const router = express.Router();
const tradingController = require('./trading.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const { placeOrderSchema } = require('./trading.validator');
const orderHistoryController = require('./orderHistory.controller');
const teamOrderController = require('./teamOrder.controller');
const { placeTeamOrderSchema, listTeamOrdersSchema } = require('./teamOrder.validator');

// ── 팀 트레이더 작업공간 (TO-01~03) — /orders/:id 같은 개인 주문 라우트와 경로가 안 겹치므로 순서 무관 ──
router.get('/team/queue', authenticate, teamOrderController.getQueue);
router.post('/team/orders', authenticate, validate(placeTeamOrderSchema), teamOrderController.placeTeamOrder);
router.get('/team/orders', authenticate, validate(listTeamOrdersSchema, 'query'), teamOrderController.listTeamOrders);

router.get('/orders', authenticate, validate(orderHistoryController.listOrdersSchema, 'query'), orderHistoryController.listMyOrders);
router.post('/orders', authenticate, validate(placeOrderSchema), tradingController.placeOrder);
router.delete('/orders/:id', authenticate, tradingController.cancelOrder);

module.exports = router;
