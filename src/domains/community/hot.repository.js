const pool = require('../../config/db');
const { appendQaScope } = require('../qa/qa.scope');

const createHotRepository = (executor = pool) => {

// 핫 종목 목록 (7일 기준, 게시글 수 + 댓글 수 + 좋아요 수 합산)
const findHotStocks = async (limit, qaSessionId = null) => {
  const conditions = [];
  const params = [];
  appendQaScope({ conditions, params, alias: 'p', qaSessionId });
  const [rows] = await executor.query(
    `SELECT p.stock_code, s.name AS stock_name,
            COUNT(DISTINCT p.id) AS post_count,
            SUM(p.comment_count) AS total_comments,
            SUM(p.like_count) AS total_likes,
            COUNT(DISTINCT p.id) + SUM(p.comment_count) + SUM(p.like_count) AS score
     FROM CommunityPosts p
     JOIN Stocks s ON p.stock_code = s.stock_code
     WHERE p.post_type = 'STOCK_DISCUSSION'
       AND ${conditions.join(' AND ')}
       AND p.deleted_at IS NULL
       AND p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     GROUP BY p.stock_code, s.name
     ORDER BY score DESC
     LIMIT ?`,
    [...params, limit]
  );
  return rows;
};

// 인기 게시물 목록 (7일 기준, 좋아요 + 댓글 + 조회수 합산)
const findPopularPosts = async (limit, qaSessionId = null) => {
  const conditions = [];
  const params = [];
  appendQaScope({ conditions, params, alias: 'p', qaSessionId });
  const [rows] = await executor.query(
    `SELECT p.id, p.user_id, p.post_type, p.stock_code, p.title,
            p.view_count, p.like_count, p.comment_count,
            p.created_at,
            u.nickname AS author_nickname,
            (p.like_count * 3 + p.comment_count * 2 + p.view_count) AS score
     FROM CommunityPosts p
     JOIN Users u ON p.user_id = u.id
     WHERE p.deleted_at IS NULL
       AND ${conditions.join(' AND ')}
       AND p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     ORDER BY score DESC
     LIMIT ?`,
    [...params, limit]
  );
  return rows;
};

return { findHotStocks, findPopularPosts };
};

module.exports = createHotRepository();
module.exports.createHotRepository = createHotRepository;
