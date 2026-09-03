const Joi = require('joi');

// 하이픈/공백을 지우고 숫자만 남긴다. 프론트가 010-1234-5678로 보내든 01012345678로 보내든
// 저장·조회·Redis 키가 한 형태로 통일되어야 한다 - 안 그러면 같은 번호가 다른 값으로 취급된다.
const normalizePhone = (value) => String(value).replace(/[^0-9]/g, '');

const phoneField = Joi.string()
  .custom((value) => normalizePhone(value))
  .pattern(/^01[016789][0-9]{7,8}$/)
  .required()
  .messages({
    'string.pattern.base': '올바른 휴대폰 번호 형식이 아닙니다.',
    'any.required': '휴대폰 번호를 입력해주세요.',
  });

const sendPhoneCodeSchema = Joi.object({ phone: phoneField });

const verifyPhoneCodeSchema = Joi.object({
  phone: phoneField,
  code: Joi.string().length(6).pattern(/^\d+$/).required().messages({
    'string.length': '인증코드는 6자리입니다.',
    'string.pattern.base': '인증코드는 숫자만 입력 가능합니다.',
    'any.required': '인증코드를 입력해주세요.',
  }),
});

module.exports = { sendPhoneCodeSchema, verifyPhoneCodeSchema, normalizePhone };
