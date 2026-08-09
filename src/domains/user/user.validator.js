const Joi = require('joi');

const updateProfileSchema = Joi.object({
  nickname: Joi.string().min(1).max(50).required().messages({
    'string.min': '닉네임은 1자 이상이어야 합니다.',
    'string.max': '닉네임은 50자 이하여야 합니다.',
    'any.required': '닉네임을 입력해주세요.',
  }),
});

module.exports = { updateProfileSchema };
