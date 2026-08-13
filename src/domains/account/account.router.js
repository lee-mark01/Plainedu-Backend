const express = require('express');
const router = express.Router();
const accountController = require('./account.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const { assetHistoryQuerySchema } = require('./account.validator');

router.get('/me', authenticate, accountController.getMyAccount);
router.get(
  '/me/history',
  authenticate,
  validate(assetHistoryQuerySchema, 'query'),
  accountController.getMyAccountHistory
);

module.exports = router;
