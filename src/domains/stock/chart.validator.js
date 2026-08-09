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

// range enum은 rangeMap 키와 자동 동기화
// before: 분봉 lazy 로딩 기준점 — 보유한 가장 오래된 봉의 time(unix 초) 그대로 전달
const chartQuerySchema = Joi.object({
  range: Joi.string()
    .valid(...RANGES)
    .default('1D'),
  before: Joi.number()
    .integer()
    .positive()
    .messages({ 'number.base': 'before는 unix timestamp(초)여야 합니다.' }),
});

module.exports = { symbolParamsSchema, chartQuerySchema };
