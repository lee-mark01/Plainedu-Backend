const Joi = require('joi');

const createTeamSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required(),
  max_member_count: Joi.number().integer().min(2).max(8).default(4),
  position: Joi.string().valid('TRADER', 'ANALYST').required(),
});

const joinTeamSchema = Joi.object({
  join_code: Joi.string().trim().uppercase().length(8).required(),
  position: Joi.string().valid('TRADER', 'ANALYST').required(),
});

// GET /api/teams — 같은 학교 팀 목록/검색 (keyword 미지정 시 전체 목록)
const listTeamsSchema = Joi.object({
  keyword: Joi.string().trim().max(50),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

// PATCH /api/teams/me/members/:userId/role — 역할·포지션 부분 수정 (요청 26)
// 둘 다 선택이고 최소 하나는 있어야 한다. role을 LEADER로 올리면 위임이 되어 현 팀장이 내려간다.
const updateMemberRoleSchema = Joi.object({
  role: Joi.string().valid('LEADER', 'MEMBER'),
  position: Joi.string().valid('TRADER', 'ANALYST'),
})
  .min(1)
  .messages({ 'object.min': '변경할 항목(role 또는 position)을 하나 이상 보내주세요.' });

const memberParamSchema = Joi.object({
  userId: Joi.number().integer().positive().required(),
});

// PUT /api/teams/me/rules — 낙관적 잠금 (요청 32)
// version은 GET으로 읽은 값을 그대로 돌려보낸다. 규칙이 없던 팀의 첫 저장은 0이다.
const saveRulesSchema = Joi.object({
  content: Joi.string().trim().min(1).max(5000).required().messages({
    'string.empty': '규칙 내용을 입력해주세요.',
    'string.max': '규칙은 5000자 이하여야 합니다.',
  }),
  version: Joi.number().integer().min(0).required().messages({
    'any.required': '조회할 때 받은 version을 함께 보내주세요.',
  }),
});

// POST /api/teams/me/delegate-and-leave (요청 29)
const delegateAndLeaveSchema = Joi.object({
  user_id: Joi.number().integer().positive().required().messages({
    'any.required': '팀장을 넘겨받을 팀원을 선택해주세요.',
  }),
});

module.exports = {
  createTeamSchema,
  joinTeamSchema,
  listTeamsSchema,
  updateMemberRoleSchema,
  memberParamSchema,
  saveRulesSchema,
  delegateAndLeaveSchema,
};
