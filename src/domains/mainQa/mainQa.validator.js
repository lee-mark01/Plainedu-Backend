const Joi = require('joi');
const { QA_PERSONA_KEYS } = require('./mainQa.config');

const mainQaLoginSchema = Joi.object({
  pin: Joi.string().trim().pattern(/^\d{6,12}$/).required().messages({
    'string.pattern.base': 'QA PIN 형식이 올바르지 않습니다.',
    'any.required': 'QA PIN을 입력해주세요.',
  }),
  // 화이트리스트 밖의 값을 400으로 막는 첫 관문. 이메일을 직접 받지 않는 이유가 여기 있다 —
  // 받는 값이 미리 정해진 키뿐이면 임의 계정 로그인이 애초에 표현 불가능하다.
  persona: Joi.string()
    .valid(...QA_PERSONA_KEYS)
    .messages({
      'any.only': `persona는 다음 중 하나여야 합니다: ${QA_PERSONA_KEYS.join(', ')}`,
    }),
});

module.exports = { mainQaLoginSchema };
