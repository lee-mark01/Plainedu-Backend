const Joi = require('joi');
const { placeOrderSchema } = require('./trading.validator');
const { listOrdersSchema } = require('./orderHistory.controller');

// POST /api/trading/team/orders — 팀 계좌 주문 (Trader 전용). 개인 주문 스키마에 proposal_id만 추가.
// 실행 대기열(TO-01)에서 참고한 매매 제안 — 느슨한 참조라 값 일치 검증은 안 함, 있으면 APPROVED인지만 확인.
const placeTeamOrderSchema = placeOrderSchema.keys({
  proposal_id: Joi.number().integer().allow(null),
});

// GET /api/trading/team/orders — 개인 주문 조회와 동일 shape이라 그대로 재사용
const listTeamOrdersSchema = listOrdersSchema;

module.exports = { placeTeamOrderSchema, listTeamOrdersSchema };
