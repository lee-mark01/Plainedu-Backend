const Joi = require('joi');

// GET /api/accounts/me/history?season_id= — 생략 시 현재 시즌
const assetHistoryQuerySchema = Joi.object({
  season_id: Joi.number().integer().min(1),
});

module.exports = { assetHistoryQuerySchema };
