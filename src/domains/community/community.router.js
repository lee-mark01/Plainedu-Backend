const express = require('express');
const router = express.Router();
const communityController = require('./community.controller');
const validate = require('../../middlewares/validate');
const { createPostSchema, getPostsByCursorSchema, updatePostSchema } = require('./community.validator');

// TODO: 라우트 추가
router.post('/posts', validate(createPostSchema), communityController.createPost);
router.get('/posts/:id', communityController.getPostById);
router.get('/posts', validate(getPostsByCursorSchema, 'query'), communityController.getPostsByCursor);
router.patch('/posts/:id', validate(updatePostSchema), communityController.updatePost);
router.delete('/posts/:id', communityController.deletePost);
module.exports = router;
