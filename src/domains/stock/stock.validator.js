const Joi = require('joi');

// GET /api/stocks/search?keyword=&limit=
const searchStocksSchema = Joi.object({
  keyword: Joi.string().trim().min(1).max(50).required()
    .messages({ 'any.required': '검색어(keyword)를 입력해주세요.' }),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

// POST /api/stocks/watchlist — body { stock_code }
const watchlistBodySchema = Joi.object({
  stock_code: Joi.string().trim().uppercase().max(20).required()
    .messages({ 'any.required': '종목 코드(stock_code)를 입력해주세요.' }),
});

// DELETE /api/stocks/watchlist/:stock_code
const watchlistParamsSchema = Joi.object({
  stock_code: Joi.string().trim().uppercase().max(20).required(),
});

module.exports = { searchStocksSchema, watchlistBodySchema, watchlistParamsSchema };
