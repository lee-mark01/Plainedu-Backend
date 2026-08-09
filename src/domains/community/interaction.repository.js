const pool = require('../../config/db');

// === 게시글 좋아요 ===
const findPostLike = async (user_id, post_id) => {
  const [rows] = await pool.query(
    'SELECT id FROM PostLikes WHERE user_id = ? AND post_id = ?',
    [user_id, post_id]
  );
  return rows[0];
};

const insertPostLike = async (user_id, post_id) => {
  await pool.query('INSERT INTO PostLikes (user_id, post_id) VALUES (?, ?)', [user_id, post_id]);
  await pool.query('UPDATE CommunityPosts SET like_count = like_count + 1 WHERE id = ?', [post_id]);
};

const deletePostLike = async (user_id, post_id) => {
  await pool.query('DELETE FROM PostLikes WHERE user_id = ? AND post_id = ?', [user_id, post_id]);
  await pool.query('UPDATE CommunityPosts SET like_count = like_count - 1 WHERE id = ?', [post_id]);
};

// === 댓글 좋아요 ===
const findCommentLike = async (user_id, comment_id) => {
  const [rows] = await pool.query(
    'SELECT id FROM CommentLikes WHERE user_id = ? AND comment_id = ?',
    [user_id, comment_id]
  );
  return rows[0];
};

const insertCommentLike = async (user_id, comment_id) => {
  await pool.query('INSERT INTO CommentLikes (user_id, comment_id) VALUES (?, ?)', [user_id, comment_id]);
  await pool.query('UPDATE CommunityComments SET like_count = like_count + 1 WHERE id = ?', [comment_id]);
};

const deleteCommentLike = async (user_id, comment_id) => {
  await pool.query('DELETE FROM CommentLikes WHERE user_id = ? AND comment_id = ?', [user_id, comment_id]);
  await pool.query('UPDATE CommunityComments SET like_count = like_count - 1 WHERE id = ?', [comment_id]);
};

// === 스크랩 ===
const findBookmark = async (user_id, post_id) => {
  const [rows] = await pool.query(
    'SELECT id FROM PostBookmarks WHERE user_id = ? AND post_id = ?',
    [user_id, post_id]
  );
  return rows[0];
};

const insertBookmark = async (user_id, post_id) => {
  await pool.query('INSERT INTO PostBookmarks (user_id, post_id) VALUES (?, ?)', [user_id, post_id]);
};

const deleteBookmark = async (user_id, post_id) => {
  await pool.query('DELETE FROM PostBookmarks WHERE user_id = ? AND post_id = ?', [user_id, post_id]);
};

// === 조회수 ===
const findPostView = async (user_id, post_id) => {
  const [rows] = await pool.query(
    'SELECT id FROM PostViews WHERE user_id = ? AND post_id = ?',
    [user_id, post_id]
  );
  return rows[0];
};

const insertPostView = async (user_id, post_id) => {
  await pool.query('INSERT INTO PostViews (user_id, post_id) VALUES (?, ?)', [user_id, post_id]);
  await pool.query('UPDATE CommunityPosts SET view_count = view_count + 1 WHERE id = ?', [post_id]);
};

// PM-02: 내 스크랩 목록 조회
const findBookmarkedPosts = async (user_id) => {
  const [rows] = await pool.query(
    `SELECT p.id, p.title, p.post_type, p.stock_code, p.opinion,
            p.view_count, p.like_count, p.comment_count,
            p.created_at, u.nickname AS author_nickname,
            pb.created_at AS bookmarked_at
     FROM PostBookmarks pb
     JOIN CommunityPosts p ON p.id = pb.post_id AND p.deleted_at IS NULL
     JOIN Users u ON u.id = p.user_id
     WHERE pb.user_id = ?
     ORDER BY pb.created_at DESC`,
    [user_id]
  );
  return rows;
};

module.exports = {
  findPostLike, insertPostLike, deletePostLike,
  findCommentLike, insertCommentLike, deleteCommentLike,
  findBookmark, insertBookmark, deleteBookmark,
  findPostView, insertPostView,
  findBookmarkedPosts,
};
