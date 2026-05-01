const Joi = require('joi');

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


module.exports = { createPostSchema };