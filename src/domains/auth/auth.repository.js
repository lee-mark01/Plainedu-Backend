const pool = require('../../config/db');

const findUserBySnsId = async (provider, snsId) => {
  const [rows] = await pool.query(
    'SELECT id, email, nickname, role, provider, sns_id FROM Users WHERE provider = ? AND sns_id = ?',
    [provider, snsId]
  );
  return rows[0] || null;
};

const findUserByEmail = async (email) => {
  const [rows] = await pool.query(
    'SELECT id, email, nickname, role, provider, sns_id FROM Users WHERE email = ?',
    [email]
  );
  return rows[0] || null;
};

const createOauthUser = async ({ email, nickname, provider, snsId }) => {
  const [result] = await pool.query(
    'INSERT INTO Users (email, nickname, provider, sns_id) VALUES (?, ?, ?, ?)',
    [email, nickname, provider, snsId]
  );
  return result.insertId;
};

const findUserById = async (id) => {
  const [rows] = await pool.query(
    'SELECT id, email, nickname, role FROM Users WHERE id = ?',
    [id]
  );
  return rows[0] || null;
};

const saveRefreshToken = async ({ userId, tokenHash, familyId, ipAddress, userAgent, expiresAt, absoluteExpiresAt }) => {
  await pool.query(
    'INSERT INTO RefreshTokens (user_id, token_hash, family_id, ip_address, user_agent, expires_at, absolute_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [userId, tokenHash, familyId, ipAddress, userAgent, expiresAt, absoluteExpiresAt]
  );
};

// used 포함해서 조회 (Reuse Detection을 위해 used=1인 행도 찾아야 함)
// absolute_expires_at 만료된 행은 완전히 무효 처리
const findRefreshToken = async (tokenHash) => {
  const [rows] = await pool.query(
    'SELECT * FROM RefreshTokens WHERE token_hash = ? AND absolute_expires_at > NOW()',
    [tokenHash]
  );
  return rows[0] || null;
};

const rotateRefreshToken = async ({ oldHash, userId, newHash, familyId, ipAddress, userAgent, expiresAt, absoluteExpiresAt }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE RefreshTokens SET used = 1 WHERE token_hash = ?', [oldHash]);
    await conn.query(
      'INSERT INTO RefreshTokens (user_id, token_hash, family_id, ip_address, user_agent, expires_at, absolute_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, newHash, familyId, ipAddress, userAgent, expiresAt, absoluteExpiresAt]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const deleteRefreshTokenFamily = async (familyId) => {
  await pool.query('DELETE FROM RefreshTokens WHERE family_id = ?', [familyId]);
};

const deleteExpiredTokens = async () => {
  const [result] = await pool.query(
    'DELETE FROM RefreshTokens WHERE absolute_expires_at < NOW()'
  );
  return result.affectedRows;
};

module.exports = {
  findUserBySnsId,
  findUserByEmail,
  createOauthUser,
  findUserById,
  saveRefreshToken,
  findRefreshToken,
  rotateRefreshToken,
  deleteRefreshTokenFamily,
  deleteExpiredTokens,
};
