const express = require('express');
const router = express.Router();
const rankingController = require('./ranking.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const {
  leaderboardQuerySchema,
  teamLeaderboardQuerySchema,
  schoolLeaderboardQuerySchema,
  rankHistoryQuerySchema,
} = require('./ranking.validator');

router.get(
  '/individual',
  authenticate,
  validate(leaderboardQuerySchema, 'query'),
  rankingController.getIndividualLeaderboard
);
router.get(
  '/teams',
  authenticate,
  validate(teamLeaderboardQuerySchema, 'query'),
  rankingController.getTeamLeaderboard
);
router.get(
  '/schools',
  authenticate,
  validate(schoolLeaderboardQuerySchema, 'query'),
  rankingController.getSchoolLeaderboard
);
// '/me/history'를 '/me'보다 먼저 둘 필요는 없다(정확 경로 매칭) — 가독성 순서 그대로
router.get('/me', authenticate, rankingController.getMyRanking);
router.get(
  '/me/history',
  authenticate,
  validate(rankHistoryQuerySchema, 'query'),
  rankingController.getMyRankHistory
);
router.get('/seasons', authenticate, rankingController.getSeasons);
router.get('/season', authenticate, rankingController.getSeason);

module.exports = router;
