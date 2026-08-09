const Joi = require('joi');

// 리더보드 공용 쿼리 (individual/teams 동일 규격)
const leaderboardQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// 소속 리더보드 — mode로 개인/팀 소속 보드 전환 (%/Point)
const schoolLeaderboardQuerySchema = Joi.object({
  mode: Joi.string().valid('individual', 'team').default('individual'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = { leaderboardQuerySchema, schoolLeaderboardQuerySchema };
