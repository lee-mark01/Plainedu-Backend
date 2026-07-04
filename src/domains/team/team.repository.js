const crypto = require('crypto');
const pool = require('../../config/db');
const AppError = require('../../errors/AppError');

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const generateJoinCode = () => {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, b => CHARSET[b % CHARSET.length]).join('');
};

// 가입 코드가 중복되지 않는 고유 코드 생성 (최대 5회 재시도)
const createUniqueJoinCode = async () => {
  for (let i = 0; i < 5; i++) {
    const code = generateJoinCode();
    const [rows] = await pool.query('SELECT id FROM Teams WHERE join_code = ?', [code]);
    if (rows.length === 0) return code;
  }
  throw new Error('join_code 생성 실패: 재시도 횟수 초과');
};

const findMembershipByUserId = async (user_id) => {
  const [rows] = await pool.query(
    'SELECT tm.*, t.name AS team_name, t.join_code FROM TeamMembers tm JOIN Teams t ON tm.team_id = t.id WHERE tm.user_id = ?',
    [user_id]
  );
  return rows[0] || null;
};

const findByJoinCode = async (join_code) => {
  const [rows] = await pool.query('SELECT * FROM Teams WHERE join_code = ?', [join_code]);
  return rows[0] || null;
};

const findById = async (team_id) => {
  const [rows] = await pool.query('SELECT * FROM Teams WHERE id = ?', [team_id]);
  return rows[0] || null;
};

// 같은 학교 팀 목록/검색 (팀명, 인원수 제공)
const findBySchool = async ({ school_id, keyword, limit }) => {
  const conditions = ['school_id = ?'];
  const params = [school_id];

  if (keyword) {
    conditions.push('name LIKE ?');
    params.push(`%${keyword}%`);
  }
  params.push(limit);

  const [rows] = await pool.query(
    `SELECT id, name, current_member_count, max_member_count
     FROM Teams
     WHERE ${conditions.join(' AND ')}
     ORDER BY name
     LIMIT ?`,
    params
  );
  return rows;
};

const findMembersByTeamId = async (team_id) => {
  const [rows] = await pool.query(
    'SELECT tm.user_id, tm.role, tm.joined_at, u.nickname FROM TeamMembers tm JOIN Users u ON tm.user_id = u.id WHERE tm.team_id = ?',
    [team_id]
  );
  return rows;
};

// 트랜잭션 내에서 팀 생성 + 리더 등록
const createTeamWithLeader = async (school_id, name, max_member_count, user_id) => {
  const join_code = await createUniqueJoinCode();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [teamResult] = await conn.query(
      'INSERT INTO Teams (school_id, name, join_code, max_member_count, current_member_count) VALUES (?, ?, ?, ?, 1)',
      [school_id, name, join_code, max_member_count]
    );
    const team_id = teamResult.insertId;
    await conn.query(
      'INSERT INTO TeamMembers (team_id, user_id, role) VALUES (?, ?, ?)',
      [team_id, user_id, 'LEADER']
    );
    await conn.commit();
    return team_id;
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY' && err.sqlMessage?.includes('uq_teams_school_name')) {
      throw new AppError('이미 존재하는 팀 이름입니다.', 409);
    }
    throw err;
  } finally {
    conn.release();
  }
};

// 트랜잭션 내에서 팀 가입 + 멤버 수 증가
const joinTeam = async (team_id, user_id) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO TeamMembers (team_id, user_id, role) VALUES (?, ?, ?)',
      [team_id, user_id, 'MEMBER']
    );
    await conn.query(
      'UPDATE Teams SET current_member_count = current_member_count + 1 WHERE id = ?',
      [team_id]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = {
  findMembershipByUserId,
  findByJoinCode,
  findById,
  findBySchool,
  findMembersByTeamId,
  createTeamWithLeader,
  joinTeam,
};
