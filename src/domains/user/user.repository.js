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

const updatePosition = async (id, position, executor = pool) => {
  await executor.query('UPDATE Users SET position = ? WHERE id = ?', [position, id]);
};

module.exports = { findAll, findById, updatePosition };
