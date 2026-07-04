const Joi = require('joi');

const createTeamSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required(),
  max_member_count: Joi.number().integer().min(2).max(8).default(4),
});

const joinTeamSchema = Joi.object({
  join_code: Joi.string().trim().uppercase().length(8).required(),
});

// GET /api/teams — 같은 학교 팀 목록/검색 (keyword 미지정 시 전체 목록)
const listTeamsSchema = Joi.object({
  keyword: Joi.string().trim().max(50),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

module.exports = { createTeamSchema, joinTeamSchema, listTeamsSchema };
