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

// GET /api/stocks/related-terms?q=&limit=
// limit이 작은 이유: 검색창 아래 붙는 짧은 추천 목록이다(요청 19). 길면 화면을 덮는다.
const relatedTermsSchema = Joi.object({
  q: Joi.string().trim().min(1).max(50).required()
    .messages({ 'any.required': '검색어(q)를 입력해주세요.' }),
  limit: Joi.number().integer().min(1).max(20).default(8),
});

module.exports = { searchStocksSchema, watchlistBodySchema, watchlistParamsSchema, relatedTermsSchema };
