const { insert } = require('./sql');

const seedCommunity = async (executor, { now, users }) => {
  const postId = await insert(
    executor,
    `INSERT INTO CommunityPosts
       (user_id, post_type, stock_code, opinion, title, content, view_count, like_count, comment_count, created_at)
     VALUES (?, 'STOCK_DISCUSSION', 'AAPL', 'BUY', ?, ?, 24, 2, 1, ?)`,
    [users[1].id, 'QA 애플 토론', 'QA fixture로 생성된 투자 의견입니다.', now]
  );
  const rootPostId = await insert(
    executor,
    `INSERT INTO CommunityPosts
       (user_id, post_type, title, content, view_count, like_count, comment_count, created_at)
     VALUES (?, 'GENERAL', ?, ?, 8, 1, 0, ?)`,
    [users[0].id, 'QA 첫 게시글', 'QA 세션에서 수정·삭제할 수 있는 게시글입니다.', now]
  );
  const commentId = await insert(
    executor,
    'INSERT INTO CommunityComments (post_id, user_id, content, like_count) VALUES (?, ?, ?, 1)',
    [postId, users[2].id, 'QA 댓글입니다.']
  );
  await executor.query('INSERT INTO PostLikes (post_id, user_id) VALUES (?, ?)', [postId, users[0].id]);
  await executor.query('INSERT INTO CommentLikes (comment_id, user_id) VALUES (?, ?)', [commentId, users[0].id]);
  await executor.query('INSERT INTO Follows (follower_id, followee_id) VALUES (?, ?)', [users[0].id, users[1].id]);
  await executor.query(
    `INSERT INTO Notifications (user_id, sender_id, type, reference_id, content, is_read)
     VALUES (?, ?, 'POST_LIKE', ?, ?, FALSE)`,
    [users[0].id, users[1].id, rootPostId, 'QA 사용자가 게시글을 좋아합니다.']
  );
  await executor.query("INSERT INTO PostStockTags (post_id, stock_code) VALUES (?, 'AAPL')", [postId]);
  await executor.query('INSERT INTO PostViews (post_id, user_id) VALUES (?, ?)', [postId, users[0].id]);
  await executor.query('INSERT INTO PostBookmarks (post_id, user_id) VALUES (?, ?)', [postId, users[0].id]);

  return { postId, rootPostId, commentId };
};

module.exports = { seedCommunity };
