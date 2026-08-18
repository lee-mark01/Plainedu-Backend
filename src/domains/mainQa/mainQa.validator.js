const Joi = require('joi');

const mainQaLoginSchema = Joi.object({
  pin: Joi.string().trim().pattern(/^\d{6,12}$/).required().messages({
    'string.pattern.base': 'QA PIN 형식이 올바르지 않습니다.',
    'any.required': 'QA PIN을 입력해주세요.',
  }),
});

module.exports = { mainQaLoginSchema };
