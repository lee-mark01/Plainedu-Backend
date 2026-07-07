const Joi = require('joi');

// POST /api/trading/orders — 모의투자 주문
const placeOrderSchema = Joi.object({
  stock_code: Joi.string().trim().uppercase().max(20).required(),
  order_type: Joi.string().valid('BUY', 'SELL').required(),
  price_type: Joi.string().valid('MARKET', 'LIMIT').required(),
  order_quantity: Joi.number().positive().precision(4).required(),
  order_price: Joi.number()
    .positive()
    .precision(2)
    .when('price_type', { is: 'LIMIT', then: Joi.required(), otherwise: Joi.forbidden() }),
});

module.exports = { placeOrderSchema };
