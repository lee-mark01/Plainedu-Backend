const Joi = require('joi');

// 필수 항목은 true만 받는다. false를 허용하면 "가입돼 있는데 약관에 동의하지 않은 유저"라는
// 법적으로 모호한 상태가 만들어진다. 필수 동의 철회는 곧 탈퇴이므로 DELETE /users/me 소관.
const REQUIRED_MSG = {
  'any.only': '필수 동의 항목은 철회할 수 없습니다. 탈퇴를 원하시면 회원 탈퇴를 이용해주세요.',
  'boolean.base': 'true 또는 false를 보내주세요.',
};

const agreementsSchema = Joi.object({
  terms: Joi.boolean().valid(true).messages(REQUIRED_MSG),
  privacy: Joi.boolean().valid(true).messages(REQUIRED_MSG),
  marketing: Joi.boolean().messages({ 'boolean.base': 'true 또는 false를 보내주세요.' }),
})
  .min(1)
  .messages({ 'object.min': '변경할 동의 항목을 하나 이상 보내주세요.' });

module.exports = { agreementsSchema };
