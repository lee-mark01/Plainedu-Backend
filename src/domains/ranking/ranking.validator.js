const Joi = require('joi');

// 리더보드 공용 쿼리 (individual/teams 동일 규격)
const leaderboardQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

// 팀 리더보드 — school_id를 주면 그 학교의 참여팀만 (리그 전체 순위는 유지)
const teamLeaderboardQuerySchema = leaderboardQuerySchema.keys({
  school_id: Joi.number().integer().min(1),
});

// 순위 추이 그래프 — season_id 생략 시 현재 시즌
const rankHistoryQuerySchema = Joi.object({
  season_id: Joi.number().integer().min(1),
  scope: Joi.string()
    .valid('individual', 'team', 'school_individual', 'school_team')
    .default('individual'),
});

// 소속 리더보드 — mode로 개인/팀 소속 보드 전환 (%/Point)
const schoolLeaderboardQuerySchema = Joi.object({
  mode: Joi.string().valid('individual', 'team').default('individual'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
  leaderboardQuerySchema,
  teamLeaderboardQuerySchema,
  schoolLeaderboardQuerySchema,
  rankHistoryQuerySchema,
};
