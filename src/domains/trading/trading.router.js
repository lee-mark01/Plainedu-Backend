const express = require('express');
const router = express.Router();
const tradingController = require('./trading.controller');
const authenticate = require('../../middlewares/authenticate');
const validate = require('../../middlewares/validate');
const { placeOrderSchema } = require('./trading.validator');

router.post('/orders', authenticate, validate(placeOrderSchema), tradingController.placeOrder);
router.delete('/orders/:id', authenticate, tradingController.cancelOrder);

module.exports = router;
