const pool = require('../../config/db');
const { blockFilterClause } = require('./blockFilter');

// 핫 종목 목록 (7일 기준, 게시글 수 + 댓글 수 + 좋아요 수 합산)
const findHotStocks = async (limit) => {
  const [rows] = await pool.query(
    `SELECT p.stock_code, s.name AS stock_name,
            COUNT(DISTINCT p.id) AS post_count,
            SUM(p.comment_count) AS total_comments,
            SUM(p.like_count) AS total_likes,
            COUNT(DISTINCT p.id) + SUM(p.comment_count) + SUM(p.like_count) AS score
     FROM CommunityPosts p
     JOIN Stocks s ON p.stock_code = s.stock_code
     WHERE p.post_type = 'STOCK_DISCUSSION'
       AND p.deleted_at IS NULL
       AND p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     GROUP BY p.stock_code, s.name
     ORDER BY score DESC
     LIMIT ?`,
    [limit]
  );
  return rows;
};

// 인기 게시물 목록 (7일 기준, 좋아요 + 댓글 + 조회수 합산)
const findPopularPosts = async (limit, viewer_id) => {
  const filter = blockFilterClause('p.user_id', viewer_id);
  const [rows] = await pool.query(
    `SELECT p.id, p.user_id, p.post_type, p.stock_code, p.title,
            p.view_count, p.like_count, p.comment_count,
            p.created_at,
            u.nickname AS author_nickname,
            (p.like_count * 3 + p.comment_count * 2 + p.view_count) AS score
     FROM CommunityPosts p
     JOIN Users u ON p.user_id = u.id
     WHERE p.deleted_at IS NULL
       AND p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ${filter.sql}
     ORDER BY score DESC
     LIMIT ?`,
    [...filter.params, limit]
  );
  return rows;
};

module.exports = { findHotStocks, findPopularPosts };
