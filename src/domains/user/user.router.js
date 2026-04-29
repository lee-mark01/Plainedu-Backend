const express = require('express');
const router = express.Router();
const userController = require('./user.controller');

// 예시: GET /api/users
router.get('/', userController.getUsers);

module.exports = router;
