const Joi = require('joi');
const { RANGES } = require('../../config/rangeMap');

// 경로 파라미터 :symbol — 미국 주식(AAPL, BRK.B) 또는 크립토/외환 페어(BTC/USD, EUR/USD)
// 페어의 슬래시는 URL에서 %2F로 인코딩해 전달해야 한다 (docs/stock-chart.md)
const symbolParamsSchema = Joi.object({
  symbol: Joi.string()
    .uppercase()
    .pattern(/^[A-Z0-9.]{1,12}(\/[A-Z0-9.]{1,12})?$/)
    .required()
    .messages({ 'string.pattern.base': '올바르지 않은 심볼 형식입니다.' }),
});

// range enum은 rangeMap 키와 자동 동기화 (스펙 §8)
// before: 분봉 lazy 로딩 기준점 — 보유한 가장 오래된 봉의 time 그대로 전달
const chartQuerySchema = Joi.object({
  range: Joi.string()
    .valid(...RANGES)
    .default('1D'),
  before: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/)
    .messages({ 'string.pattern.base': 'before는 "YYYY-MM-DD" 또는 "YYYY-MM-DD HH:mm:ss" 형식이어야 합니다.' }),
});

module.exports = { symbolParamsSchema, chartQuerySchema };
