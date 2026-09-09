const Joi = require('joi');

// GET /api/admin/reports?status=&target_type=&page=&limit=
// 미처리(RECEIVED) 건부터 보는 게 기본이라 status를 필터로 둔다.
const reportListSchema = Joi.object({
  status: Joi.string().valid('RECEIVED', 'REVIEWING', 'RESOLVED', 'REJECTED'),
  target_type: Joi.string().valid('POST', 'COMMENT', 'USER'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

module.exports = { reportListSchema };
