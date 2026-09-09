const Joi = require('joi');

// GET /api/community/users/suggested?limit=
// 커뮤니티 홈에 붙는 짧은 추천 카드 목록이라 기본 5개다(요청 20).
const suggestedUsersSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(20).default(5),
});

module.exports = { suggestedUsersSchema };
