const pool = require('../../config/db');

// 접수. 같은 대상을 이미 신고했으면 false를 돌려준다(uq_cr_reporter_target).
// 서비스가 409로 바꾼다 — 중복 접수를 허용하면 신고 수를 제재 근거로 쓸 때 부풀릴 수 있다.
const insertReport = async ({ reporter_id, target_type, target_id, reason, detail }) => {
  try {
    const [result] = await pool.query(
      `INSERT INTO CommunityReports (reporter_id, target_type, target_id, reason, detail)
       VALUES (?, ?, ?, ?, ?)`,
      [reporter_id, target_type, target_id, reason, detail ?? null]
    );
    return result.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return null;
    throw err;
  }
};

// 신고 대상이 실재하는지 확인용. 대상 종류마다 테이블이 달라 한 곳에서 갈라준다.
// 삭제된 글·댓글도 신고 대상으로 본다 — 신고 화면을 열어둔 사이 지워질 수 있고,
// 접수 자체를 막으면 사용자에게는 이유 없는 실패로 보인다.
const targetExists = async (target_type, target_id) => {
  const table = {
    POST: 'CommunityPosts',
    COMMENT: 'CommunityComments',
    USER: 'Users',
  }[target_type];
  if (!table) return false;

  const [rows] = await pool.query(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`, [target_id]);
  return rows.length > 0;
};

// 관리자용 신고 목록. 미처리 건이 먼저, 그다음 오래된 순 — 밀린 것부터 처리하도록.
// 같은 대상에 신고가 몇 건 쌓였는지 함께 준다: 제재 판단의 핵심 근거다.
const findAllReports = async ({ status, target_type, page, limit }, executor = pool) => {
  const conditions = [];
  const params = [];
  if (status) { conditions.push('r.status = ?'); params.push(status); }
  if (target_type) { conditions.push('r.target_type = ?'); params.push(target_type); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await executor.query(
    `SELECT COUNT(*) AS total FROM CommunityReports r ${where}`,
    params
  );

  const [rows] = await executor.query(
    `SELECT r.id AS report_id, r.reporter_id, u.nickname AS reporter_nickname,
            r.target_type, r.target_id, r.reason, r.detail, r.status,
            r.created_at, r.processed_at,
            (SELECT COUNT(*) FROM CommunityReports c
              WHERE c.target_type = r.target_type AND c.target_id = r.target_id) AS target_report_count
     FROM CommunityReports r
     JOIN Users u ON u.id = r.reporter_id
     ${where}
     ORDER BY (r.status = 'RECEIVED') DESC, r.created_at ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );

  return {
    reports: rows.map((r) => ({
      report_id: r.report_id,
      reporter: { user_id: r.reporter_id, nickname: r.reporter_nickname },
      target_type: r.target_type,
      target_id: r.target_id,
      reason: r.reason,
      detail: r.detail,
      status: r.status,
      // 이 대상이 지금까지 받은 총 신고 수
      target_report_count: Number(r.target_report_count),
      created_at: r.created_at,
      processed_at: r.processed_at,
    })),
    pagination: { page, limit, total: Number(countRows[0].total) },
  };
};

module.exports = { insertReport, targetExists, findAllReports };
