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

// ── 멤버 조작 ──
// 아래 함수들은 전부 executor를 받는다. 탈퇴·위임·해체는 여러 테이블을 한 트랜잭션으로 묶어야
// 해서 호출부가 conn을 넘긴다.

// 잠금까지 거는 조회. 두 사람이 동시에 팀장을 바꾸거나 나가면 "팀장 0명"이 만들어질 수 있어
// 멤버 행을 먼저 잠그고 판단한다.
const findMembersForUpdate = async (team_id, executor) => {
  const [rows] = await executor.query(
    'SELECT user_id, role, joined_at FROM TeamMembers WHERE team_id = ? ORDER BY joined_at ASC, user_id ASC FOR UPDATE',
    [team_id]
  );
  return rows;
};

const updateMemberRole = async (team_id, user_id, role, executor = pool) => {
  await executor.query('UPDATE TeamMembers SET role = ? WHERE team_id = ? AND user_id = ?', [
    role,
    team_id,
    user_id,
  ]);
};

// 멤버 제거 + 인원수 감소를 한 쌍으로 묶는다. current_member_count가 어긋나면 가입 가능 여부
// 판정(joinTeam의 정원 체크)이 틀어진다.
const removeMember = async (team_id, user_id, executor = pool) => {
  await executor.query('DELETE FROM TeamMembers WHERE team_id = ? AND user_id = ?', [team_id, user_id]);
  await executor.query(
    'UPDATE Teams SET current_member_count = GREATEST(current_member_count - 1, 0) WHERE id = ?',
    [team_id]
  );
};

// Teams 삭제 하나로 TeamMembers·Portfolios·TeamActivePortfolios·VirtualAccounts(TEAM)와
// 그 아래 주문·보유가 FK CASCADE로 함께 사라진다. DailyRankings는 Teams FK가 없어 남는데,
// 그건 의도된 것이다 — 과거 순위 기록은 팀이 사라져도 보존한다(target_name 스냅샷 참고).
const deleteTeam = async (team_id, executor = pool) => {
  await executor.query('DELETE FROM Teams WHERE id = ?', [team_id]);
};

// ── 팀 규칙 ──

const findRulesByTeamId = async (team_id, executor = pool) => {
  const [rows] = await executor.query(
    `SELECT tr.content, tr.version, tr.updated_at, tr.updated_by, u.nickname AS updated_by_nickname
     FROM TeamRules tr
     LEFT JOIN Users u ON u.id = tr.updated_by
     WHERE tr.team_id = ?`,
    [team_id]
  );
  return rows[0] || null;
};

// 낙관적 잠금 저장. 기대 버전이 현재 버전과 같을 때만 쓰고, 바뀐 행 수로 성공 여부를 돌려준다.
// version 0은 "아직 규칙이 없다"는 뜻이라 INSERT 경로로 간다.
const saveRules = async (team_id, content, expectedVersion, updated_by, executor = pool) => {
  if (expectedVersion === 0) {
    try {
      await executor.query(
        'INSERT INTO TeamRules (team_id, content, version, updated_by) VALUES (?, ?, 1, ?)',
        [team_id, content, updated_by]
      );
      return true;
    } catch (err) {
      // 그 사이 누군가 먼저 만들었다 — 버전 충돌과 같은 상황이다.
      if (err.code === 'ER_DUP_ENTRY') return false;
      throw err;
    }
  }

  const [result] = await executor.query(
    'UPDATE TeamRules SET content = ?, version = version + 1, updated_by = ? WHERE team_id = ? AND version = ?',
    [content, updated_by, team_id, expectedVersion]
  );
  return result.affectedRows > 0;
};

module.exports = {
  findMembershipByUserId,
  findByJoinCode,
  findById,
  findBySchool,
  findMembersByTeamId,
  createTeamWithLeader,
  joinTeam,
  findMembersForUpdate,
  updateMemberRole,
  removeMember,
  deleteTeam,
  findRulesByTeamId,
  saveRules,
};
