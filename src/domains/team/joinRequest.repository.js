const pool = require('../../config/db');

// 이 유저의 대기 중 신청을 잠근 채로 찾는다.
//
// FOR UPDATE인 이유: "대기 중 신청은 하나만"을 DB 제약으로 걸 수 없다(MySQL에 부분 유니크
// 인덱스가 없다). 두 요청이 동시에 오면 둘 다 "대기 신청 없음"을 보고 각자 만들 수 있어,
// 잠금과 생성이 한 트랜잭션이어야 한다.
const findPendingByUserForUpdate = async (user_id, conn) => {
  const [rows] = await conn.query(
    "SELECT id, team_id FROM TeamJoinRequests WHERE user_id = ? AND status = 'PENDING' FOR UPDATE",
    [user_id]
  );
  return rows;
};

// 신청 잠금 조회 (승인·거절용). 팀 소유 확인은 호출부가 team_id로 한다.
const findByIdForUpdate = async (id, conn) => {
  const [rows] = await conn.query(
    'SELECT id, team_id, user_id, position, status FROM TeamJoinRequests WHERE id = ? FOR UPDATE',
    [id]
  );
  return rows[0] || null;
};

const createRequest = async (team_id, user_id, position, conn) => {
  const [result] = await conn.query(
    'INSERT INTO TeamJoinRequests (team_id, user_id, position) VALUES (?, ?, ?)',
    [team_id, user_id, position]
  );
  return result.insertId;
};

// 대기 신청을 취소로 바꾼다. 지우지 않는 이유: 지우면 "왜 사라졌지"를 설명할 수 없고
// 팀장 쪽 목록에서도 흔적이 없어진다.
const cancelPending = async (ids, conn) => {
  if (!ids.length) return;
  await conn.query(
    "UPDATE TeamJoinRequests SET status = 'CANCELED', processed_at = NOW() WHERE id IN (?)",
    [ids]
  );
};

// status 조건을 두는 이유: 두 팀장이 동시에 처리하거나 같은 버튼을 두 번 눌러도
// 첫 판정만 적용된다. 바뀐 행 수로 성공 여부를 돌려준다.
const decideRequest = async (id, status, processed_by, conn) => {
  const [result] = await conn.query(
    "UPDATE TeamJoinRequests SET status = ?, processed_at = NOW(), processed_by = ? WHERE id = ? AND status = 'PENDING'",
    [status, processed_by, id]
  );
  return result.affectedRows > 0;
};

// 팀장이 보는 목록. 대기 건이 먼저, 그다음 최근 처리 순.
// 신청자 정보를 조인해 함께 준다 — 프론트가 신청마다 유저를 다시 조회하지 않도록.
const findByTeam = async (team_id, { status, page, limit }, executor = pool) => {
  const conditions = ['r.team_id = ?'];
  const params = [team_id];
  if (status) {
    conditions.push('r.status = ?');
    params.push(status);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;

  const [countRows] = await executor.query(
    `SELECT COUNT(*) AS total FROM TeamJoinRequests r ${where}`,
    params
  );

  const [rows] = await executor.query(
    `SELECT r.id AS request_id, r.user_id, u.nickname, r.position, r.status,
            r.created_at, r.processed_at
     FROM TeamJoinRequests r
     JOIN Users u ON u.id = r.user_id
     ${where}
     ORDER BY (r.status = 'PENDING') DESC, r.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );

  return { rows, total: Number(countRows[0].total) };
};

module.exports = {
  findPendingByUserForUpdate,
  findByIdForUpdate,
  createRequest,
  cancelPending,
  decideRequest,
  findByTeam,
};
