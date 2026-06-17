const pool = require('../../config/db');

// 댓글 저장
const save = async (user_id, post_id, content, parent_id) => {
  const [result] = await pool.query(
    'INSERT INTO CommunityComments (user_id, post_id, content, parent_id) VALUES (?, ?, ?, ?)',
    [user_id, post_id, content, parent_id]
  );
  return result.insertId;
};

// 댓글 단건 조회
const findById = async (id) => {
  const [rows] = await pool.query(
    'SELECT * FROM CommunityComments WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return rows[0];
};

// 댓글 수정
const update = async (id, content) => {
  await pool.query(
    'UPDATE CommunityComments SET content = ?, updated_at = NOW() WHERE id = ?',
    [content, id]
  );
};

// 댓글 소프트 삭제
const softDelete = async (id) => {
  await pool.query(
    'UPDATE CommunityComments SET deleted_at = NOW() WHERE id = ?',
    [id]
  );
};

// 게시글의 댓글 목록 조회 (댓글 + 대댓글, 작성자 닉네임 포함)
const findByPostId = async (post_id) => {
  const [rows] = await pool.query(
    `SELECT c.id, c.post_id, c.user_id, c.parent_id, c.content,
            c.like_count, c.created_at, c.updated_at,
            u.nickname AS author_nickname
     FROM CommunityComments c
     JOIN Users u ON c.user_id = u.id
     WHERE c.post_id = ? AND c.deleted_at IS NULL
     ORDER BY c.created_at ASC`,
    [post_id]
  );
  return rows;
};

module.exports = { save, findById, update, softDelete, findByPostId };