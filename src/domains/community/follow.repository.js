const pool = require('../../config/db');
const { blockFilterClause } = require('./blockFilter');

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

// executor를 받는 이유: 차단은 팔로우 해제와 한 트랜잭션으로 묶인다 (block.service).
const deleteFollow = async (follower_id, followee_id, executor = pool) => {
  await executor.query(
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
// viewer_id는 차단 필터용(비로그인이면 undefined). 차단 관계인 사람은 목록에서 뺀다.
// 카운트(countFollowers/countFollowings)는 필터하지 않는다 — 프로필의 팔로워 수는 그 사람의
// 실제 관계 수이고, 보는 사람에 따라 숫자가 달라지면 같은 프로필이 사람마다 다르게 보인다.
const findFollowers = async (user_id, viewer_id) => {
  const filter = blockFilterClause('f.follower_id', viewer_id);
  const [rows] = await pool.query(
    `SELECT u.id, u.nickname, f.created_at AS followed_at
     FROM Follows f
     JOIN Users u ON f.follower_id = u.id
     WHERE f.followee_id = ? ${filter.sql}
     ORDER BY f.created_at DESC`,
    [user_id, ...filter.params]
  );
  return rows;
};

// 팔로잉 목록
const findFollowings = async (user_id, viewer_id) => {
  const filter = blockFilterClause('f.followee_id', viewer_id);
  const [rows] = await pool.query(
    `SELECT u.id, u.nickname, f.created_at AS followed_at
     FROM Follows f
     JOIN Users u ON f.followee_id = u.id
     WHERE f.follower_id = ? ${filter.sql}
     ORDER BY f.created_at DESC`,
    [user_id, ...filter.params]
  );
  return rows;
};

module.exports = { findFollow, insertFollow, deleteFollow, countFollowers, countFollowings, findFollowers, findFollowings };
