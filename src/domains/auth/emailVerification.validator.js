const Joi = require('joi');

const sendCodeSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': '올바른 이메일 형식이 아닙니다.',
    'any.required': '이메일을 입력해주세요.',
  }),
});

const verifyCodeSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': '올바른 이메일 형식이 아닙니다.',
    'any.required': '이메일을 입력해주세요.',
  }),
  code: Joi.string().length(6).pattern(/^\d+$/).required().messages({
    'string.length': '인증코드는 6자리입니다.',
    'string.pattern.base': '인증코드는 숫자만 입력 가능합니다.',
    'any.required': '인증코드를 입력해주세요.',
  }),
});

module.exports = { sendCodeSchema, verifyCodeSchema };
