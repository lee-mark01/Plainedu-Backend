const pool = require('../../config/db');

// 유효한 제한 = 상태가 ACTIVE이고 아직 만료되지 않은 것.
//
// 만료를 배치로 EXPIRED로 바꾸지 않고 조회 시점에 판단하는 이유: 배치가 늦게 돌거나
// 실패하면 만료된 제한에 사용자가 계속 걸린다. 시각 비교는 늘 정확하다.
// (EXPIRED 상태 값은 관리자 목록에서 구분하기 위한 표시로만 쓴다)
//
// 별칭을 인자로 받는 이유: 조인 쿼리에서는 `r.status`가 되어야 하는데, 문자열 치환으로
// 접두사를 붙이면 조건문이 조용히 망가진다.
const activeCondition = (alias = '') => {
  const p = alias ? `${alias}.` : '';
  return `${p}status = 'ACTIVE' AND (${p}ends_at IS NULL OR ${p}ends_at > NOW())`;
};

const expiredCondition = (alias = '') => {
  const p = alias ? `${alias}.` : '';
  return `${p}status = 'ACTIVE' AND ${p}ends_at IS NOT NULL AND ${p}ends_at <= NOW()`;
};

const findActiveByUserId = async (user_id, executor = pool) => {
  const [rows] = await executor.query(
    `SELECT id, type, reason, detail, starts_at, ends_at
     FROM UserRestrictions
     WHERE user_id = ? AND ${activeCondition()}
     ORDER BY id DESC LIMIT 1`,
    [user_id]
  );
  return rows[0] || null;
};

// 해제·이의신청 처리용. 잠근 채로 읽어야 두 관리자가 동시에 처리하지 않는다.
const findByIdForUpdate = async (id, conn) => {
  const [rows] = await conn.query(
    'SELECT id, user_id, status, ends_at FROM UserRestrictions WHERE id = ? FOR UPDATE',
    [id]
  );
  return rows[0] || null;
};

const createRestriction = async (
  { user_id, reason, detail, ends_at, created_by },
  executor = pool
) => {
  const [result] = await executor.query(
    `INSERT INTO UserRestrictions (user_id, reason, detail, ends_at, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [user_id, reason, detail ?? null, ends_at ?? null, created_by]
  );
  return result.insertId;
};

// status 조건을 두는 이유: 이미 해제된 제한을 다시 해제하면 lifted_at이 뒤바뀐다.
const liftRestriction = async (id, lifted_by, executor = pool) => {
  const [result] = await executor.query(
    `UPDATE UserRestrictions
     SET status = 'LIFTED', lifted_by = ?, lifted_at = NOW()
     WHERE id = ? AND status = 'ACTIVE'`,
    [lifted_by, id]
  );
  return result.affectedRows > 0;
};

// 이 유저의 제한 이력 (요청 33은 현재 상태만 필요하지만, 화면에 지난 제한을 보여줄 수 있게 둔다)
const findByUserId = async (user_id, executor = pool) => {
  const [rows] = await executor.query(
    `SELECT id, type, reason, detail, starts_at, ends_at, status, created_at, lifted_at,
            (${activeCondition()}) AS is_effective
     FROM UserRestrictions
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [user_id]
  );
  return rows;
};

// 관리자 목록. 유효한 제한이 먼저, 그다음 최근 순.
// 만료된 건은 status가 여전히 ACTIVE로 남아 있으므로 is_effective를 계산해 함께 준다.
const findAllRestrictions = async ({ status, page, limit }, executor = pool) => {
  const conditions = [];
  const params = [];

  if (status === 'ACTIVE') {
    conditions.push(activeCondition('r'));
  } else if (status === 'EXPIRED') {
    conditions.push(expiredCondition('r'));
  } else if (status) {
    conditions.push('r.status = ?');
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await executor.query(
    `SELECT COUNT(*) AS total FROM UserRestrictions r ${where}`,
    params
  );

  const [rows] = await executor.query(
    `SELECT r.id, r.user_id, u.nickname, r.type, r.reason, r.detail,
            r.starts_at, r.ends_at, r.status, r.created_at, r.lifted_at,
            (${activeCondition('r')}) AS is_effective
     FROM UserRestrictions r
     JOIN Users u ON u.id = r.user_id
     ${where}
     ORDER BY is_effective DESC, r.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );

  return { rows, total: Number(countRows[0].total) };
};

module.exports = {
  findActiveByUserId,
  findByIdForUpdate,
  findByUserId,
  createRestriction,
  liftRestriction,
  findAllRestrictions,
  activeCondition,
};
