const Joi = require('joi');

const GUBUNS = ['elem_list', 'midd_list', 'high_list', 'univ_list'];

// POST /api/schools/sync — 동기화 대상 학교 구분 (미지정 시 서비스 기본값 사용)
const syncSchoolsSchema = Joi.object({
  gubuns: Joi.array().items(Joi.string().valid(...GUBUNS)).min(1),
});

// GET /api/schools — 학교 검색
const searchSchoolsSchema = Joi.object({
  keyword: Joi.string().trim().max(100),
  region: Joi.string().trim().max(50),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

module.exports = { syncSchoolsSchema, searchSchoolsSchema };
