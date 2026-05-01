// TODO: 컨트롤러 구현
const AppError = require('../../errors/AppError');
const communityService = require('./community.service');
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


const createPost = async (req, res, next) => {
  try {
    const { error, value } = createPostSchema.validate(req.body);
    if (error) {
      throw new AppError(error.details[0].message, 400);
    }
    const { user_id, post_type, stock_code, opinion, title, content } = value;
    const postId = await communityService.createPost(user_id, post_type, stock_code, opinion, title, content);
    res.json({ success: true, data: postId });
  } catch (err) {
    next(err);
  }
};

module.exports = { createPost };
