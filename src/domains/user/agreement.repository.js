const pool = require('../../config/db');

const TYPES = ['TERMS', 'PRIVACY', 'MARKETING'];

const findByUserId = async (userId) => {
  const [rows] = await pool.query(
    'SELECT type, is_agreed FROM UserAgreements WHERE user_id = ?',
    [userId]
  );
  return rows;
};

// 동의(true)면 agreed_at과 version을 새로 찍고, 철회(false)면 둘 다 기존 값을 그대로 둔다.
// "언제 어떤 버전에 동의했었는지"는 철회 후에도 증빙으로 남아야 한다.
const upsert = async (userId, type, isAgreed, version) => {
  await pool.query(
    `INSERT INTO UserAgreements (user_id, type, is_agreed, version, agreed_at)
     VALUES (?, ?, ?, ?, IF(?, NOW(), NULL))
     ON DUPLICATE KEY UPDATE
       is_agreed = VALUES(is_agreed),
       version   = IF(VALUES(is_agreed), VALUES(version), version),
       agreed_at = IF(VALUES(is_agreed), NOW(), agreed_at)`,
    [userId, type, isAgreed, version, isAgreed]
  );
};

module.exports = { findByUserId, upsert, TYPES };
