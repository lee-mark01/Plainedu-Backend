const pool = require('../../config/db');

// 이의신청. 제한 건당 하나만 받는다(uq_ra_restriction) — 중복 접수를 허용하면
// 관리자 목록이 같은 건으로 채워지고 어느 걸 처리해야 하는지 모호해진다.
// 이미 있으면 null을 돌려주고 서비스가 409로 바꾼다.
const insertAppeal = async ({ restriction_id, user_id, content }, executor = pool) => {
  try {
    const [result] = await executor.query(
      'INSERT INTO RestrictionAppeals (restriction_id, user_id, content) VALUES (?, ?, ?)',
      [restriction_id, user_id, content]
    );
    return result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return null;
    throw err;
  }
};

// 이 제한에 이의신청이 있나. 제한 건당 하나뿐이라 존재 여부만 보면 된다
// (요청 33의 can_appeal 판정에 쓴다).
const findByRestrictionId = async (restriction_id, executor = pool) => {
  const [rows] = await executor.query(
    'SELECT id, status FROM RestrictionAppeals WHERE restriction_id = ? LIMIT 1',
    [restriction_id]
  );
  return rows[0] || null;
};

// 내 이의신청 목록. 요청 11이 요구한 상태와 제출·처리 시각을 담고,
// 어느 제한에 대한 신청인지 알 수 있게 제한 정보를 조인한다.
const findByUserId = async (user_id, { page, limit }, executor = pool) => {
  const [countRows] = await executor.query(
    'SELECT COUNT(*) AS total FROM RestrictionAppeals WHERE user_id = ?',
    [user_id]
  );

  const [rows] = await executor.query(
    `SELECT a.id AS appeal_id, a.restriction_id, a.content, a.status,
            a.admin_comment, a.created_at, a.processed_at,
            r.reason AS restriction_reason, r.starts_at, r.ends_at
     FROM RestrictionAppeals a
     JOIN UserRestrictions r ON r.id = a.restriction_id
     WHERE a.user_id = ?
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`,
    [user_id, limit, (page - 1) * limit]
  );

  return { rows, total: Number(countRows[0].total) };
};

const findByIdForUpdate = async (id, conn) => {
  const [rows] = await conn.query(
    'SELECT id, restriction_id, user_id, status FROM RestrictionAppeals WHERE id = ? FOR UPDATE',
    [id]
  );
  return rows[0] || null;
};

// 미처리(RECEIVED·REVIEWING) 건이 먼저 오도록 정렬한다 — 관리자가 처리할 것부터 본다.
const findAllAppeals = async ({ status, page, limit }, executor = pool) => {
  const conditions = [];
  const params = [];
  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await executor.query(
    `SELECT COUNT(*) AS total FROM RestrictionAppeals a ${where}`,
    params
  );

  const [rows] = await executor.query(
    `SELECT a.id AS appeal_id, a.restriction_id, a.user_id, u.nickname,
            a.content, a.status, a.admin_comment, a.created_at, a.processed_at,
            r.reason AS restriction_reason, r.status AS restriction_status
     FROM RestrictionAppeals a
     JOIN Users u ON u.id = a.user_id
     JOIN UserRestrictions r ON r.id = a.restriction_id
     ${where}
     ORDER BY (a.status IN ('RECEIVED','REVIEWING')) DESC, a.created_at ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );

  return { rows, total: Number(countRows[0].total) };
};

// status 조건으로 재처리를 막는다 — 두 관리자가 동시에 눌러도 첫 판정만 남는다.
const decideAppeal = async (id, status, processed_by, admin_comment, executor = pool) => {
  const [result] = await executor.query(
    `UPDATE RestrictionAppeals
     SET status = ?, processed_by = ?, admin_comment = ?, processed_at = NOW()
     WHERE id = ? AND status IN ('RECEIVED','REVIEWING')`,
    [status, processed_by, admin_comment ?? null, id]
  );
  return result.affectedRows > 0;
};

module.exports = {
  insertAppeal,
  findByRestrictionId,
  findByUserId,
  findByIdForUpdate,
  findAllAppeals,
  decideAppeal,
};
