const { placeOrderSchema } = require('./trading.validator');
const { listOrdersSchema } = require('./orderHistory.controller');

// POST /api/trading/team/orders — 팀 계좌 주문 (Trader 전용). 개인 주문과 동일 shape.
const placeTeamOrderSchema = placeOrderSchema;

// GET /api/trading/team/orders — 개인 주문 조회와 동일 shape이라 그대로 재사용
const listTeamOrdersSchema = listOrdersSchema;

module.exports = { placeTeamOrderSchema, listTeamOrdersSchema };
