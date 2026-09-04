const express = require('express');
const router = express.Router();
const stockAlertController = require('./stockAlert.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const { symbolParamsSchema, saveAlertsSchema, pushTokenSchema } = require('./stockAlert.validator');

// 전부 로그인 필수 — 알림 설정은 계정에 딸린 값이다.
router.use(authenticate);

// push-token은 :symbol보다 먼저 선언해야 한다. 뒤에 두면 'push-token'이 심볼로 매칭된다.
router.post('/push-token', validate(pushTokenSchema), stockAlertController.registerPushToken);

router.get('/:symbol', validate(symbolParamsSchema, 'params'), stockAlertController.getAlerts);
router.put(
  '/:symbol',
  validate(symbolParamsSchema, 'params'),
  validate(saveAlertsSchema),
  stockAlertController.saveAlerts
);

module.exports = router;
