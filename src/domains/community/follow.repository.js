const pool = require('../../config/db');

const findFollow = async (follower_id, followee_id) => {
  const [rows] = await pool.query(
    'SELECT id FROM Follows WHERE follower_id = ? AND followee_id = ?',
    [follower_id, followee_id]
  );
  return rows[0];
};

const insertFollow = async (follower_id, followee_id) => {
  await pool.query(
    'INSERT INTO Follows (follower_id, followee_id) VALUES (?, ?)',
    [follower_id, followee_id]
  );
};

const deleteFollow = async (follower_id, followee_id) => {
  await pool.query(
    'DELETE FROM Follows WHERE follower_id = ? AND followee_id = ?',
    [follower_id, followee_id]
  );
};

// 팔로워 수 / 팔로잉 수
const countFollowers = async (user_id) => {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS count FROM Follows WHERE followee_id = ?',
    [user_id]
  );
  return rows[0].count;
};

const countFollowings = async (user_id) => {
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS count FROM Follows WHERE follower_id = ?',
    [user_id]
  );
  return rows[0].count;
};

// 팔로워 목록
const findFollowers = async (user_id) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.nickname, f.created_at AS followed_at
     FROM Follows f
     JOIN Users u ON f.follower_id = u.id
     WHERE f.followee_id = ?
     ORDER BY f.created_at DESC`,
    [user_id]
  );
  return rows;
};

// 팔로잉 목록
const findFollowings = async (user_id) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.nickname, f.created_at AS followed_at
     FROM Follows f
     JOIN Users u ON f.followee_id = u.id
     WHERE f.follower_id = ?
     ORDER BY f.created_at DESC`,
    [user_id]
  );
  return rows;
};

module.exports = { findFollow, insertFollow, deleteFollow, countFollowers, countFollowings, findFollowers, findFollowings };
