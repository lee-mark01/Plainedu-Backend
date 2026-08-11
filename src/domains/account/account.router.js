const express = require('express');
const router = express.Router();
const accountController = require('./account.controller');
const authenticate = require('../../middlewares/authenticate');

router.get('/me', authenticate, accountController.getMyAccount);
router.get('/me/history', authenticate, accountController.getMyAccountHistory);

module.exports = router;
