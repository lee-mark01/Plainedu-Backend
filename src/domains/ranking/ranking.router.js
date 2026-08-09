const express = require('express');
const router = express.Router();
const rankingController = require('./ranking.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const { leaderboardQuerySchema, schoolLeaderboardQuerySchema } = require('./ranking.validator');

router.get(
  '/individual',
  authenticate,
  validate(leaderboardQuerySchema, 'query'),
  rankingController.getIndividualLeaderboard
);
router.get(
  '/teams',
  authenticate,
  validate(leaderboardQuerySchema, 'query'),
  rankingController.getTeamLeaderboard
);
router.get(
  '/schools',
  authenticate,
  validate(schoolLeaderboardQuerySchema, 'query'),
  rankingController.getSchoolLeaderboard
);
router.get('/me', authenticate, rankingController.getMyRanking);
router.get('/season', authenticate, rankingController.getSeason);

module.exports = router;
