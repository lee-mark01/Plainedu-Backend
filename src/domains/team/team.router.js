const express = require('express');
const router = express.Router();
const teamController = require('./team.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const { createTeamSchema, joinTeamSchema, listTeamsSchema } = require('./team.validator');

router.post('/', authenticate, validate(createTeamSchema), teamController.createTeam);
router.post('/join', authenticate, validate(joinTeamSchema), teamController.joinTeam);
router.get('/', authenticate, validate(listTeamsSchema, 'query'), teamController.listTeams);
router.get('/me', authenticate, teamController.getMyTeam);
router.get('/me/account', authenticate, teamController.getMyTeamAccount);
router.get('/me/account/history', authenticate, teamController.getMyTeamAccountHistory);

module.exports = router;
