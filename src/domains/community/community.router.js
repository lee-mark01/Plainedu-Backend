const express = require('express');
const router = express.Router();
const communityController = require('./community.controller');
const validate = require('../../middlewares/validate');
const { createPostSchema } = require('./community.validator');

// TODO: 라우트 추가
router.post('/posts', validate(createPostSchema), communityController.createPost);

module.exports = router;
