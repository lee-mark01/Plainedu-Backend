const pool = require('../../config/db');

// 댓글 저장 (+ 게시글 comment_count 증가 — 핫/인기 점수식이 이 값을 쓴다)
// like_count·view_count와 동일하게 트랜잭션 없이 2문 처리. 카운터가 캐시 성격이라
//           드문 실패 시 어긋날 수 있음. 정합성이 문제되면 withTransaction으로 묶을 것.
const save = async (user_id, post_id, content, parent_id) => {
  const [result] = await pool.query(
    'INSERT INTO CommunityComments (user_id, post_id, content, parent_id) VALUES (?, ?, ?, ?)',
    [user_id, post_id, content, parent_id]
  );
  await pool.query('UPDATE CommunityPosts SET comment_count = comment_count + 1 WHERE id = ?', [post_id]);
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

// 댓글 소프트 삭제 (+ comment_count 감소)
// 이미 삭제된 댓글이면 affectedRows가 0 → 카운터를 건드리지 않는다 (중복 감소 방지)
const softDelete = async (id, post_id) => {
  const [result] = await pool.query(
    'UPDATE CommunityComments SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (result.affectedRows === 0) return;

  await pool.query(
    'UPDATE CommunityPosts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = ?',
    [post_id]
  );
};

// 게시글의 댓글 목록 조회 (댓글 + 대댓글, 작성자 닉네임 포함)
// 삭제된 댓글도 함께 가져온다 — 답글이 달린 부모를 걸러버리면 그 답글까지 트리에서 사라지기 때문.
// 실제로 무엇을 노출할지는 service의 buildCommentTree가 정한다.
const findByPostId = async (post_id) => {
  const [rows] = await pool.query(
    `SELECT c.id, c.post_id, c.user_id, c.parent_id, c.content,
            c.like_count, c.created_at, c.updated_at, c.deleted_at,
            u.nickname AS author_nickname
     FROM CommunityComments c
     JOIN Users u ON c.user_id = u.id
     WHERE c.post_id = ?
     ORDER BY c.created_at ASC`,
    [post_id]
  );
  return rows;
};

module.exports = { save, findById, update, softDelete, findByPostId };