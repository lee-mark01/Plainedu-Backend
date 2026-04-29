const pool = require('../../config/db');

const findAll = async () => {
  const [rows] = await pool.query('SELECT id, email, nickname, role FROM Users');
  return rows;
};

module.exports = { findAll };
