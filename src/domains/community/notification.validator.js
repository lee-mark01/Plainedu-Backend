const Joi = require('joi');

// GET /api/community/notifications — 컨트롤러가 req.validated.limit을 읽으므로 기본값이 필수다
// (validate를 안 걸면 req.validated 자체가 undefined라 500)
const getNotificationsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20)
});

module.exports = { getNotificationsSchema };
