// TODO: 레포지토리 구현
const pool = require('../../config/db');

// 게시글 저장
const save = async (user_id, post_type, stock_code, opinion, title, content) => {
  const [result] = await pool.query(
    'INSERT INTO CommunityPosts (user_id, post_type, stock_code, opinion, title, content) VALUES (?, ?, ?, ?, ?, ?)',
    [user_id, post_type, stock_code, opinion, title, content]
  );

    return result.insertId;
};

// 단일 게시글 조회
const findById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM CommunityPosts WHERE id = ?', [id]);
  return rows[0];
};

// cursor 기반 페이지네이션
const findByCursor = async (cursor, limit) => {
  if (cursor) {
    // WHERE id < cursor 붙인 쿼리
      const [rows] = await pool.query(
        'SELECT * FROM CommunityPosts WHERE id < ? ORDER BY id DESC LIMIT ?',
        [cursor, limit]
      );
      return rows;
    } else {
      // WHERE 없이 최신순 limit개
      const [rows] = await pool.query(
        'SELECT * FROM CommunityPosts ORDER BY id DESC LIMIT ?',
        [limit]
      );
      return rows;
    }
}

module.exports = { save, findById, findByCursor };