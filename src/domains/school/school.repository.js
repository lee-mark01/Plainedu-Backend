const pool = require('../../config/db');

// 학교 목록 배치 upsert
// (school_name, region) UNIQUE 키 기준 upsert → 동기화 재실행 시 안전
// gubun에서 파생된 school_group은 항상 최신값으로 덮어써서, 이름 휴리스틱으로 백필된 값도 다음 동기화 때 정정된다.
// @returns {number} 새로 삽입/갱신된 행 수
const bulkUpsertSchools = async (schools, schoolGroup = null) => {
  if (!schools.length) return 0;

  const values = schools.map((s) => [s.schoolName, s.region, schoolGroup]);
  const [result] = await pool.query(
    `INSERT INTO schools (school_name, region, school_group) VALUES ?
     ON DUPLICATE KEY UPDATE school_group = VALUES(school_group)`,
    [values]
  );
  return result.affectedRows;
};

const findById = async (id) => {
  const [rows] = await pool.query('SELECT id, school_name, region, school_group FROM schools WHERE id = ?', [id]);
  return rows[0] || null;
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

module.exports = { bulkUpsertSchools, countSchools, searchSchools, findById };
