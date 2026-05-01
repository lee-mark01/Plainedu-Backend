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

// cursor 기반 페이지네이션 스키마
const getPostsByCursorSchema = Joi.object({
    cursor: Joi.number().integer().optional(), // 다음 페이지의 시작점이 되는 게시글 ID
    limit: Joi.number().integer().min(1).max(100).default(20) // 페이지당 최대 100개, 기본값 20
});

module.exports = { createPostSchema, getPostsByCursorSchema };