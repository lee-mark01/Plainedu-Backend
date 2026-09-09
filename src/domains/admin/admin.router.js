const express = require('express');
const router = express.Router();
const authenticate = require('../../middlewares/authenticate');
const requireAdmin = require('../../middlewares/requireAdmin');
const validate = require('../../middlewares/validate');
const adminController = require('./admin.controller');
const {
  createRestrictionSchema,
  restrictionListSchema,
  adminAppealListSchema,
  decideAppealSchema,
  restrictionIdParamSchema,
  appealIdParamSchema,
} = require('../community/restriction.validator');
const { reportListSchema } = require('./admin.validator');

// 경로 전체를 관리자로 제한한다. 핸들러마다 role을 확인하면 한 곳만 빠져도 구멍이 된다.
//
// /api/admin 아래로 분리한 이유: 경로만 봐도 관리자용인 게 드러나고, 나중에 IP 제한 같은
// 조치를 이 라우터에만 얹을 수 있다.
router.use(authenticate, requireAdmin);

// 신고 목록 — 제재 판단의 근거
router.get('/reports', validate(reportListSchema, 'query'), adminController.listReports);

// 제재
router.get('/restrictions', validate(restrictionListSchema, 'query'), adminController.listRestrictions);
router.post('/restrictions', validate(createRestrictionSchema), adminController.createRestriction);
router.delete(
  '/restrictions/:restrictionId',
  validate(restrictionIdParamSchema, 'params'),
  adminController.liftRestriction
);

// 이의신청
router.get('/appeals', validate(adminAppealListSchema, 'query'), adminController.listAppeals);
router.post(
  '/appeals/:appealId/decision',
  validate(appealIdParamSchema, 'params'),
  validate(decideAppealSchema),
  adminController.decideAppeal
);

module.exports = router;
