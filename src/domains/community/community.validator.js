const Joi = require('joi');

// 게시글 생성 스키마
const createPostSchema = Joi.object({
    user_id: Joi.number().integer().required(),
    post_type: Joi.string().valid('STOCK_DISCUSSION', 'GENERAL').required(),
    stock_code: Joi.string().when('post_type', {
        is: 'STOCK_DISCUSSION',
        then: Joi.required(),
        otherwise: Joi.valid(null)
    }),
    opinion: Joi.string().when('post_type', {
        is: 'STOCK_DISCUSSION',
        then: Joi.string().valid('BUY', 'NEUTRAL', 'SELL').required(),
        otherwise: Joi.valid(null)
    }),
    title: Joi.string().trim().required(),
    content: Joi.string().trim().required()
})

// 게시글 수정 스키마
const updatePostSchema = Joi.object({
    title: Joi.string().trim().min(1),
    content: Joi.string().trim().min(1),
    opinion: Joi.string().valid('BUY', 'NEUTRAL', 'SELL')
}).min(1); // 최소한 하나 이상의 필드가 필요하도록 설정

// cursor 기반 페이지네이션 스키마 + 게시글 유형, 종목 코드 필터링 추가
const getPostsByCursorSchema = Joi.object({
    cursor: Joi.number().integer().optional(), // 다음 페이지의 시작점이 되는 게시글 ID
    limit: Joi.number().integer().min(1).max(100).default(20), // 페이지당 최대 100개, 기본값 20
    post_type: Joi.string().valid('STOCK_DISCUSSION', 'GENERAL').optional(), // 게시글 유형 필터링 추가
    stock_code: Joi.string().optional(), // 종목 코드 필터링 추가
    keyword: Joi.string().optional(), // 검색 기능을 위해 사용할 키워드 필드.
    search_type: Joi.string().valid('TITLE', 'CONTENT', 'AUTHOR').optional(),
    user_id: Joi.number().integer().optional() // 내가 쓴 글 필터링을 위해 user_id 추가 TODO: 나중에 req.user.id로 교체하면서 user_id는 제거할 예정
    }).and('keyword', 'search_type'); // 검색 대상 필드 지정. keyword랑 항상 같이 있거나, 같이 없거나.



// 종목 검색 스키마
const searchStocksSchema = Joi.object({
    keyword: Joi.string().trim().required(),
    limit: Joi.number().integer().min(1).max(100).default(20)
});

module.exports = { createPostSchema, getPostsByCursorSchema, updatePostSchema, searchStocksSchema };