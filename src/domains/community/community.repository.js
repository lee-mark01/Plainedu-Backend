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

// 게시글 수정
const update = async (id, fields) => {
    const keys = Object.keys(fields);
    const setClause = keys.map(k => `${k} = ?`).join(',');
    const values = keys.map(k => fields[k]);
    await pool.query(
      `UPDATE CommunityPosts SET ${setClause},
  updated_at = NOW() WHERE id = ?`,
      [...values, id]
  );
};


// 게시글 소프트 딜리트
const softDelete = async (id) => {
    await pool.query(
      'UPDATE CommunityPosts SET deleted_at = NOW() WHERE id = ?',
      [id]
  );
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

module.exports = { save, findById, findByCursor, update, softDelete };