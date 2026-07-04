const pool = require('../../config/db');

// 학교 목록 배치 upsert
// (school_name, region) UNIQUE 키 기준으로 중복 무시 → 동기화 재실행 시 안전
// @returns {number} 새로 삽입된 행 수
const bulkUpsertSchools = async (schools) => {
  if (!schools.length) return 0;

  const values = schools.map((s) => [s.schoolName, s.region]);
  // INSERT IGNORE: 이미 존재하는 (school_name, region)은 건너뜀
  const [result] = await pool.query(
    'INSERT IGNORE INTO schools (school_name, region) VALUES ?',
    [values]
  );
  return result.affectedRows;
};

const countSchools = async () => {
  const [rows] = await pool.query('SELECT COUNT(*) AS count FROM schools');
  return rows[0].count;
};

// 학교 검색 (이름 부분 일치, 선택적으로 지역 필터)
const searchSchools = async ({ keyword, region, limit }) => {
  const conditions = [];
  const params = [];

  if (keyword) {
    conditions.push('school_name LIKE ?');
    params.push(`%${keyword}%`);
  }
  if (region) {
    conditions.push('region = ?');
    params.push(region);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const [rows] = await pool.query(
    `SELECT id, school_name, region FROM schools ${where} ORDER BY school_name LIMIT ?`,
    params
  );
  return rows;
};

module.exports = { bulkUpsertSchools, countSchools, searchSchools };
