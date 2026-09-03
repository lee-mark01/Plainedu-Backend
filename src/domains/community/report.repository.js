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

module.exports = { insertReport, targetExists };
