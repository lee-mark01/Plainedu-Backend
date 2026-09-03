const pool = require('../../config/db');
const { blockFilterClause } = require('./blockFilter');

// 알림 생성
const save = async (user_id, sender_id, type, reference_id, content) => {
  const [result] = await pool.query(
    'INSERT INTO Notifications (user_id, sender_id, type, reference_id, content) VALUES (?, ?, ?, ?, ?)',
    [user_id, sender_id, type, reference_id, content]
  );
  return result.insertId;
};

// 알림 목록 조회 (최신순)
// 차단 관계인 사람이 보낸 알림은 빼고 준다. 차단해도 과거 알림이 남아 있으면 목록에서
// 상대 닉네임이 계속 보인다. 행을 지우지는 않는다 — 차단을 풀면 다시 보이는 게 자연스럽고,
// 알림은 기록이라 지우면 되돌릴 수 없다.
const findByUserId = async (user_id, limit) => {
  const filter = blockFilterClause('n.sender_id', user_id);
  const [rows] = await pool.query(
    `SELECT n.id, n.type, n.reference_id, n.content, n.is_read, n.created_at,
            u.nickname AS sender_nickname
     FROM Notifications n
     JOIN Users u ON n.sender_id = u.id
     WHERE n.user_id = ? ${filter.sql}
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [user_id, ...filter.params, limit]
  );
  return rows;
};

// 알림 읽음 처리
const markAsRead = async (id, user_id) => {
  const [result] = await pool.query(
    'UPDATE Notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
    [id, user_id]
  );
  return result.affectedRows;
};

// 알림 전체 읽음 처리
const markAllAsRead = async (user_id) => {
  await pool.query(
    'UPDATE Notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
    [user_id]
  );
};

module.exports = { save, findByUserId, markAsRead, markAllAsRead };
