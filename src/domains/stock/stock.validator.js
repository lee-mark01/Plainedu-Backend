const Joi = require('joi');

// GET /api/stocks/search?keyword=&limit=
const searchStocksSchema = Joi.object({
  keyword: Joi.string().trim().min(1).max(50).required()
    .messages({ 'any.required': '검색어(keyword)를 입력해주세요.' }),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

module.exports = { searchStocksSchema };
