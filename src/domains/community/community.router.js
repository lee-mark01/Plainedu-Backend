const express = require('express');
const router = express.Router();
const communityController = require('./post.controller');
const commentController = require('./comment.controller');
const interactionController = require('./interaction.controller');
const hotController = require('./hot.controller');
const followController = require('./follow.controller');
const notificationController = require('./notification.controller');
const validate = require('../../middlewares/validate');
const authenticate = require('../../middlewares/authenticate');
const { createPostSchema, getPostsByCursorSchema, updatePostSchema, searchStocksSchema } = require('./post.validator');
const { createCommentSchema, updateCommentSchema } = require('./comment.validator');
const { hotListSchema } = require('./hot.validator');

// 게시글 (조회: 공개 / 작성·수정·삭제: 인증 필요)
router.post('/posts', authenticate, validate(createPostSchema), communityController.createPost);
router.get('/posts/:id', communityController.getPostById);
router.get('/posts', validate(getPostsByCursorSchema, 'query'), communityController.getPostsByCursor);
router.get('/stocks/search', validate(searchStocksSchema, 'query'), communityController.searchStocks);
router.get('/posts/my', authenticate, validate(getPostsByCursorSchema, 'query'), communityController.getMyPosts);
router.patch('/posts/:id', authenticate, validate(updatePostSchema), communityController.updatePost);
router.delete('/posts/:id', authenticate, communityController.deletePost);

// 댓글 (조회: 공개 / 작성·수정·삭제: 인증 필요)
router.post('/posts/:post_id/comments', authenticate, validate(createCommentSchema), commentController.createComment);
router.get('/posts/:post_id/comments', commentController.getCommentsByPostId);
router.patch('/comments/:comment_id', authenticate, validate(updateCommentSchema), commentController.updateComment);
router.delete('/comments/:comment_id', authenticate, commentController.deleteComment);

// 좋아요 / 스크랩 / 조회수 (인증 필요)
router.post('/posts/:post_id/like', authenticate, interactionController.togglePostLike);
router.post('/comments/:comment_id/like', authenticate, interactionController.toggleCommentLike);
router.post('/posts/:post_id/bookmark', authenticate, interactionController.toggleBookmark);
router.post('/posts/:post_id/view', authenticate, interactionController.recordPostView);

// 핫/인기 (공개)
router.get('/hot/stocks', validate(hotListSchema, 'query'), hotController.getHotStocks);
router.get('/hot/posts', validate(hotListSchema, 'query'), hotController.getPopularPosts);

// 팔로우 (인증 필요)
router.post('/users/:user_id/follow', authenticate, followController.toggleFollow);
router.get('/users/:user_id/follow/counts', followController.getFollowCounts);
router.get('/users/:user_id/followers', followController.getFollowers);
router.get('/users/:user_id/followings', followController.getFollowings);

// 알림 (인증 필요)
router.get('/notifications', authenticate, notificationController.getNotifications);
router.patch('/notifications/:notification_id/read', authenticate, notificationController.markAsRead);
router.patch('/notifications/read-all', authenticate, notificationController.markAllAsRead);

module.exports = router;
