const Joi = require('joi');

/**
 * query 파라미터: year, month (월별 출석 조회) — 둘 다 있거나 둘 다 없어야 함
 */
const attendanceQuerySchema = Joi.object({
  year: Joi.number().integer().min(2020).max(2100).optional(),
  month: Joi.number().integer().min(1).max(12).optional(),
}).and('year', 'month');

module.exports = {
  attendanceQuerySchema,
};
