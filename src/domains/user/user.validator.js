const Joi = require('joi');

const updateProfileSchema = Joi.object({
  nickname: Joi.string().min(1).max(50).messages({
    'string.min': '닉네임은 1자 이상이어야 합니다.',
    'string.max': '닉네임은 50자 이하여야 합니다.',
  }),
  school_id: Joi.number().integer().min(1).messages({
    'number.base': 'school_id는 숫자여야 합니다.',
  }),
})
  .min(1)
  .messages({ 'object.min': '변경할 항목을 하나 이상 보내주세요.' });

module.exports = { updateProfileSchema };
