const express = require('express');
const router = express.Router();
const teamController = require('./team.controller');
const joinRequestController = require('./joinRequest.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const {
  createTeamSchema,
  joinTeamSchema,
  listTeamsSchema,
  updateMemberRoleSchema,
  memberParamSchema,
  saveRulesSchema,
  delegateAndLeaveSchema,
  joinRequestListSchema,
  decideJoinRequestSchema,
} = require('./team.validator');

router.post('/', authenticate, validate(createTeamSchema), teamController.createTeam);
router.post('/join', authenticate, validate(joinTeamSchema), teamController.joinTeam);
router.get('/', authenticate, validate(listTeamsSchema, 'query'), teamController.listTeams);
router.get('/me', authenticate, teamController.getMyTeam);
router.get('/me/account', authenticate, teamController.getMyTeamAccount);
router.get('/me/account/history', authenticate, teamController.getMyTeamAccountHistory);

// ── 초대 코드 (요청 22, 23) ──
// 승인제에서 코드는 "신청 관문"이다. 유출 시 스팸 신청을 끊으려면 재발급이 필요하다.
router.get('/me/invitations', authenticate, joinRequestController.getInvitation);
router.post('/me/invitations', authenticate, joinRequestController.reissueInvitation);

// ── 가입 신청 (요청 24, 25) ── 팀장만
router.get(
  '/me/join-requests',
  authenticate,
  validate(joinRequestListSchema, 'query'),
  joinRequestController.getJoinRequests
);
router.post(
  '/me/join-requests',
  authenticate,
  validate(decideJoinRequestSchema),
  joinRequestController.decideJoinRequest
);

// ── 팀 규칙 (요청 31, 32) ──
router.get('/me/rules', authenticate, teamController.getRules);
router.put('/me/rules', authenticate, validate(saveRulesSchema), teamController.saveRules);

// ── 탈퇴·해체 (요청 27~30) ──
// exit-options가 "지금 무엇이 가능한지"를 먼저 알려주고, 프론트는 그 결과로 버튼을 결정한다.
router.get('/me/exit-options', authenticate, teamController.getExitOptions);
router.post('/me/leave', authenticate, teamController.leaveTeam);
router.post(
  '/me/delegate-and-leave',
  authenticate,
  validate(delegateAndLeaveSchema),
  teamController.delegateAndLeave
);
router.delete('/me', authenticate, teamController.disbandTeam);

// ── 팀원 역할·포지션 (요청 26) ──
// :userId 경로는 위의 고정 경로들보다 뒤에 둔다 — '/me/...'가 먼저 매칭되어야 한다.
router.patch(
  '/me/members/:userId/role',
  authenticate,
  validate(memberParamSchema, 'params'),
  validate(updateMemberRoleSchema),
  teamController.updateMemberRole
);

module.exports = router;
