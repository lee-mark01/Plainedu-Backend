const pool = require('../../config/db');

const findAll = async () => {
  const [rows] = await pool.query('SELECT id, email, nickname, role FROM Users');
  return rows;
};

const findById = async (id) => {
  const [rows] = await pool.query(
    'SELECT id, email, nickname, role, school_id, school_is_verified, position FROM Users WHERE id = ?',
    [id]
  );
  return rows[0] || null;
};

// 마이페이지 프로필 — 유저 기본 정보 + 학교 + 팀 + 출석 + 포인트 + 개인계좌
const findProfileById = async (id) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.nickname, u.role, u.position, u.provider,
            u.school_id, u.school_is_verified, u.created_at,
            s.school_name,
            t.id AS team_id, t.name AS team_name,
            tm.role AS team_role,
            att.consecutive_days, att.total_learning_days,
            IFNULL(up.current_points, 0) AS current_points,
            va.total_equity, va.initial_cash, va.current_return_rate
     FROM Users u
     LEFT JOIN schools s ON s.id = u.school_id
     LEFT JOIN TeamMembers tm ON tm.user_id = u.id
     LEFT JOIN Teams t ON t.id = tm.team_id
     LEFT JOIN (
       SELECT user_id, consecutive_days, total_learning_days
       FROM Attendances WHERE (user_id, attendance_date) IN (
         SELECT user_id, MAX(attendance_date) FROM Attendances GROUP BY user_id
       )
     ) att ON att.user_id = u.id
     LEFT JOIN UserPoints up ON up.user_id = u.id
     LEFT JOIN VirtualAccounts va ON va.user_id = u.id AND va.account_type = 'INDIVIDUAL'
       AND va.season_id = (SELECT id FROM Seasons WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1)
     WHERE u.id = ?`,
    [id]
  );
  return rows[0] || null;
};

const updateNickname = async (id, nickname) => {
  await pool.query('UPDATE Users SET nickname = ? WHERE id = ?', [nickname, id]);
};

const updatePosition = async (id, position, executor = pool) => {
  await executor.query('UPDATE Users SET position = ? WHERE id = ?', [position, id]);
};

const updateSchool = async (id, schoolId, executor = pool) => {
  await executor.query(
    'UPDATE Users SET school_id = ?, school_is_verified = FALSE WHERE id = ?',
    [schoolId, id]
  );
};

const updateSchoolVerified = async (id, verified) => {
  await pool.query('UPDATE Users SET school_is_verified = ? WHERE id = ?', [verified, id]);
};

const deleteUser = async (id) => {
  await pool.query('DELETE FROM Users WHERE id = ?', [id]);
};

module.exports = {
  findAll, findById, findProfileById, updateNickname, updatePosition, updateSchool, updateSchoolVerified, deleteUser,
};
