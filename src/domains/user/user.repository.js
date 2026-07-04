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

module.exports = { findAll, findById };
