const express = require('express');
const router = express.Router();
const communityController = require('./community.controller');

// TODO: 라우트 추가
router.post('/posts', communityController.createPost);

module.exports = router;
