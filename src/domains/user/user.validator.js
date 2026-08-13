const Joi = require('joi');

// 둘 다 선택 항목이고 최소 하나는 있어야 한다 — 닉네임만, 학교만, 또는 둘 다 보낼 수 있다.
// school_id는 GET /api/schools(커리어넷 동기화분) 검색 결과의 id를 그대로 넘긴다.
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
