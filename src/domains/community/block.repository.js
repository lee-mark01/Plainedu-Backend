const pool = require('../../config/db');

const findBlock = async (blocker_id, blocked_id, executor = pool) => {
  const [rows] = await executor.query(
    'SELECT id FROM CommunityBlocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1',
    [blocker_id, blocked_id]
  );
  return rows[0] || null;
};

// 이미 차단한 상대면 조용히 넘어간다(멱등). 목록 화면에서 두 번 눌리는 경우가 실제로 있고,
// 그때 409를 내면 프론트가 "이미 차단됨"을 성공처럼 다뤄야 해서 분기가 늘어난다.
const insertBlock = async (blocker_id, blocked_id, executor = pool) => {
  await executor.query(
    'INSERT IGNORE INTO CommunityBlocks (blocker_id, blocked_id) VALUES (?, ?)',
    [blocker_id, blocked_id]
  );
};

// 해제된 행이 있었는지 돌려준다 — 프론트가 목록을 갱신할 때 실제 해제 여부를 알아야 한다.
const deleteBlock = async (blocker_id, blocked_id, executor = pool) => {
  const [result] = await executor.query(
    'DELETE FROM CommunityBlocks WHERE blocker_id = ? AND blocked_id = ?',
    [blocker_id, blocked_id]
  );
  return result.affectedRows > 0;
};

// 차단 목록 — 검색(닉네임) + page/limit 페이지네이션.
// 커뮤니티 피드는 cursor 방식이지만 이 화면은 관리 목록이라 총 개수와 페이지 이동이 필요하다
// (api-conventions의 두 방식 중 페이지 번호 쪽).
const findBlockedUsers = async (blocker_id, { keyword, page, limit }) => {
  const conditions = ['b.blocker_id = ?'];
  const params = [blocker_id];

  if (keyword) {
    conditions.push('u.nickname LIKE ?');
    params.push(`%${keyword}%`);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM CommunityBlocks b JOIN Users u ON u.id = b.blocked_id ${where}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT u.id AS user_id, u.nickname, b.created_at AS blocked_at
     FROM CommunityBlocks b
     JOIN Users u ON u.id = b.blocked_id
     ${where}
     ORDER BY b.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );

  return { rows, total: countRows[0].total };
};

module.exports = { findBlock, insertBlock, deleteBlock, findBlockedUsers };
