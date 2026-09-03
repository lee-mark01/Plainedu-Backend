const Joi = require('joi');

// POST /api/community/reports (요청 7)
// detail은 선택이지만 ETC(기타)일 때는 사유를 알 수 없으므로 필수로 만든다.
const createReportSchema = Joi.object({
  target_type: Joi.string().valid('POST', 'COMMENT', 'USER').required().messages({
    'any.only': '신고 대상은 POST, COMMENT, USER 중 하나여야 합니다.',
    'any.required': '신고 대상 종류를 선택해주세요.',
  }),
  target_id: Joi.number().integer().positive().required().messages({
    'any.required': '신고할 대상을 선택해주세요.',
  }),
  reason: Joi.string().valid('SPAM', 'ABUSE', 'ADULT', 'FALSE_INFO', 'ETC').required().messages({
    'any.only': '신고 사유를 목록에서 선택해주세요.',
    'any.required': '신고 사유를 선택해주세요.',
  }),
  detail: Joi.string().trim().max(500).allow('').messages({
    'string.max': '상세 내용은 500자 이하여야 합니다.',
  }),
}).when(Joi.object({ reason: Joi.valid('ETC') }).unknown(), {
  then: Joi.object({
    detail: Joi.string().trim().min(1).required().messages({
      'any.required': '기타 사유는 상세 내용을 함께 적어주세요.',
      'string.empty': '기타 사유는 상세 내용을 함께 적어주세요.',
    }),
  }),
});

// GET /api/community/blocks (요청 8)
// 커뮤니티 피드는 cursor 방식이지만 이 화면은 관리 목록이라 page/limit을 쓴다.
const blockListSchema = Joi.object({
  keyword: Joi.string().trim().max(50),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

// POST /api/community/blocks (요청 9)
const blockUserSchema = Joi.object({
  user_id: Joi.number().integer().positive().required().messages({
    'any.required': '차단할 사용자를 선택해주세요.',
  }),
});

// DELETE /api/community/blocks/:userId (요청 10)
const blockParamSchema = Joi.object({
  userId: Joi.number().integer().positive().required(),
});

module.exports = { createReportSchema, blockListSchema, blockUserSchema, blockParamSchema };
