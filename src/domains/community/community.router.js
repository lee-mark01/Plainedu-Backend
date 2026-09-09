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
const optionalAuthenticate = require('../../middlewares/optionalAuthenticate');
const moderationController = require('./moderation.controller');
const suggestController = require('./suggest.controller');
const restrictionController = require('./restriction.controller');
const requireNotRestricted = require('./requireNotRestricted');
const { createPostSchema, getPostsByCursorSchema, updatePostSchema, searchStocksSchema } = require('./post.validator');
const { createCommentSchema, updateCommentSchema } = require('./comment.validator');
const { hotListSchema } = require('./hot.validator');
const { getNotificationsSchema } = require('./notification.validator');
const {
  createReportSchema,
  blockListSchema,
  blockUserSchema,
  blockParamSchema,
} = require('./moderation.validator');
const { suggestedUsersSchema } = require('./suggest.validator');
const {
  submitAppealSchema,
  appealListSchema,
} = require('./restriction.validator');

// 게시글 (조회: 공개 / 작성·수정·삭제: 인증 필요)
router.post('/posts', authenticate, requireNotRestricted, validate(createPostSchema), communityController.createPost);
router.get('/posts/my', authenticate, validate(getPostsByCursorSchema, 'query'), communityController.getMyPosts);
router.get('/posts/bookmarked', authenticate, interactionController.getBookmarkedPosts);
router.get('/posts/:id', optionalAuthenticate, communityController.getPostById);
router.get('/posts', optionalAuthenticate, validate(getPostsByCursorSchema, 'query'), communityController.getPostsByCursor);
router.get('/stocks/search', validate(searchStocksSchema, 'query'), communityController.searchStocks);
router.patch('/posts/:id', authenticate, requireNotRestricted, validate(updatePostSchema), communityController.updatePost);
router.delete('/posts/:id', authenticate, communityController.deletePost);

// 댓글 (조회: 공개 / 작성·수정·삭제: 인증 필요)
router.post('/posts/:post_id/comments', authenticate, requireNotRestricted, validate(createCommentSchema), commentController.createComment);
router.get('/posts/:post_id/comments', optionalAuthenticate, commentController.getCommentsByPostId);
router.patch('/comments/:comment_id', authenticate, requireNotRestricted, validate(updateCommentSchema), commentController.updateComment);
router.delete('/comments/:comment_id', authenticate, commentController.deleteComment);

// 좋아요 / 스크랩 / 조회수 (인증 필요)
router.post('/posts/:post_id/like', authenticate, requireNotRestricted, interactionController.togglePostLike);
router.post('/comments/:comment_id/like', authenticate, requireNotRestricted, interactionController.toggleCommentLike);
router.post('/posts/:post_id/bookmark', authenticate, interactionController.toggleBookmark);
router.post('/posts/:post_id/view', authenticate, interactionController.recordPostView);

// 핫/인기 (공개)
router.get('/hot/stocks', validate(hotListSchema, 'query'), hotController.getHotStocks);
router.get('/hot/posts', optionalAuthenticate, validate(hotListSchema, 'query'), hotController.getPopularPosts);

// 팔로우 (인증 필요)
// 추천 사용자 (요청 20). 고정 경로라 '/users/:user_id/...'보다 앞에 있어야 한다 —
// 뒤에 두면 'suggested'가 user_id로 매칭된다.
router.get('/users/suggested', authenticate, validate(suggestedUsersSchema, 'query'), suggestController.getSuggestedUsers);

router.post('/users/:user_id/follow', authenticate, requireNotRestricted, followController.toggleFollow);
router.get('/users/:user_id/follow/counts', followController.getFollowCounts);
router.get('/users/:user_id/followers', optionalAuthenticate, followController.getFollowers);
router.get('/users/:user_id/followings', optionalAuthenticate, followController.getFollowings);

// 알림 (인증 필요)
router.get('/notifications', authenticate, validate(getNotificationsSchema, 'query'), notificationController.getNotifications);
router.patch('/notifications/:notification_id/read', authenticate, notificationController.markAsRead);
router.patch('/notifications/read-all', authenticate, notificationController.markAllAsRead);

// requireNotRestricted가 걸린 곳: 글·댓글 작성/수정, 좋아요, 팔로우.
// 걸지 않은 곳과 이유 — 조회(전부 공개), 삭제(자기 글 정리는 막을 이유가 없다),
// 북마크(개인 저장), 조회수, 신고·차단(제한된 사용자도 자기 보호는 해야 한다),
// 알림 읽음(자기 알림 정리).
//
// ── 이용 제한·이의신청 (요청 11, 12, 33) ──
// 제한 중에도 자기 상태 조회와 이의신청은 해야 하므로 requireNotRestricted를 걸지 않는다.
router.get('/restrictions/me', authenticate, restrictionController.getMyRestriction);
router.get(
  '/restriction/appeals',
  authenticate,
  validate(appealListSchema, 'query'),
  restrictionController.getMyAppeals
);
router.post(
  '/restriction/appeals',
  authenticate,
  validate(submitAppealSchema),
  restrictionController.submitAppeal
);

// ── 신고·차단 (요청 7~10) ──
// 전부 인증 필요 — 누가 신고·차단하는지가 곧 데이터다.
router.post('/reports', authenticate, validate(createReportSchema), moderationController.createReport);
router.get('/blocks', authenticate, validate(blockListSchema, 'query'), moderationController.getBlockedUsers);
router.post('/blocks', authenticate, validate(blockUserSchema), moderationController.blockUser);
router.delete('/blocks/:userId', authenticate, validate(blockParamSchema, 'params'), moderationController.unblockUser);

module.exports = router;
