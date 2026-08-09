const Joi = require('joi');

// 게시글 생성 스키마
const createPostSchema = Joi.object({
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
});

// 게시글 수정 스키마
const updatePostSchema = Joi.object({
    title: Joi.string().trim().min(1),
    content: Joi.string().trim().min(1),
    opinion: Joi.string().valid('BUY', 'NEUTRAL', 'SELL')
}).min(1);

// cursor 기반 페이지네이션 스키마
const getPostsByCursorSchema = Joi.object({
    cursor: Joi.number().integer().optional(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    post_type: Joi.string().valid('STOCK_DISCUSSION', 'GENERAL').optional(),
    stock_code: Joi.string().optional(),
    keyword: Joi.string().optional(),
    search_type: Joi.string().valid('TITLE', 'CONTENT', 'AUTHOR').optional(),
}).and('keyword', 'search_type');

// 종목 검색 스키마
const searchStocksSchema = Joi.object({
    keyword: Joi.string().trim().required(),
    limit: Joi.number().integer().min(1).max(100).default(20)
});

module.exports = { createPostSchema, getPostsByCursorSchema, updatePostSchema, searchStocksSchema };
