// TODO: 레포지토리 구현
const pool = require('../../config/db');

const save = async (user_id, post_type, stock_code, opinion, title, content) => {

  const [result] = await pool.query(
    'INSERT INTO CommunityPosts (user_id, post_type, stock_code, opinion, title, content) VALUES (?, ?, ?, ?, ?, ?)',
    [user_id, post_type, stock_code, opinion, title, content]
  );

    return result.insertId;
};

const findById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM CommunityPosts WHERE id = ?', [id]);
  return rows[0];
};


module.exports = { save, findById };