const Joi = require('joi');

// POST /api/community/restriction/appeals (요청 12)
const submitAppealSchema = Joi.object({
  restriction_id: Joi.number().integer().positive().required().messages({
    'any.required': '이의신청할 제한 건을 선택해주세요.',
  }),
  content: Joi.string().trim().min(10).max(1000).required().messages({
    'string.min': '이의신청 내용을 10자 이상 작성해주세요.',
    'string.max': '이의신청 내용은 1000자 이하여야 합니다.',
    'any.required': '이의신청 내용을 작성해주세요.',
  }),
});

// GET /api/community/restriction/appeals (요청 11)
const appealListSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

// POST /api/admin/restrictions
// days를 받아 서버가 종료 시각을 계산한다 — 클라이언트가 보낸 시각을 그대로 쓰면
// 시간대 해석이 갈려 의도한 기간과 어긋난다. 생략하면 무기한이다.
const createRestrictionSchema = Joi.object({
  user_id: Joi.number().integer().positive().required(),
  reason: Joi.string().valid('SPAM', 'ABUSE', 'ADULT', 'FALSE_INFO', 'ETC').required().messages({
    'any.only': '제한 사유를 목록에서 선택해주세요.',
  }),
  detail: Joi.string().trim().max(500).allow(''),
  days: Joi.number().integer().min(1).max(3650).messages({
    'number.min': '제한 기간은 1일 이상이어야 합니다.',
  }),
}).when(Joi.object({ reason: Joi.valid('ETC') }).unknown(), {
  then: Joi.object({
    detail: Joi.string().trim().min(1).required().messages({
      'any.required': '기타 사유는 상세 내용을 함께 적어주세요.',
    }),
  }),
});

// 관리자 목록 필터
const restrictionListSchema = Joi.object({
  status: Joi.string().valid('ACTIVE', 'EXPIRED', 'LIFTED'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

const adminAppealListSchema = Joi.object({
  status: Joi.string().valid('RECEIVED', 'REVIEWING', 'APPROVED', 'REJECTED'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

// POST /api/admin/appeals/:appealId/decision
const decideAppealSchema = Joi.object({
  decision: Joi.string().valid('APPROVE', 'REJECT').required().messages({
    'any.only': 'decision은 APPROVE 또는 REJECT여야 합니다.',
  }),
  admin_comment: Joi.string().trim().max(500).allow(''),
});

const idParamSchema = (key) =>
  Joi.object({ [key]: Joi.number().integer().positive().required() });

module.exports = {
  submitAppealSchema,
  appealListSchema,
  createRestrictionSchema,
  restrictionListSchema,
  adminAppealListSchema,
  decideAppealSchema,
  restrictionIdParamSchema: idParamSchema('restrictionId'),
  appealIdParamSchema: idParamSchema('appealId'),
};
