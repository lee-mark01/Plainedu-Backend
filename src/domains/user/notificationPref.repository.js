const pool = require('../../config/db');

// 저장된 항목만 돌려준다. 없는 항목은 기본값이 채운다(notificationPref.defaults).
const findByUserId = async (user_id, executor = pool) => {
  const [rows] = await executor.query(
    'SELECT pref_key, is_enabled FROM NotificationPrefs WHERE user_id = ?',
    [user_id]
  );
  return new Map(rows.map((r) => [r.pref_key, Boolean(r.is_enabled)]));
};

// 보낸 항목만 갱신한다(요청 14의 부분 수정). 나머지 행은 건드리지 않으므로
// 한 항목만 바꿔도 다른 설정이 초기화되지 않는다.
const upsertMany = async (user_id, entries, executor = pool) => {
  if (!entries.length) return;

  await executor.query(
    `INSERT INTO NotificationPrefs (user_id, pref_key, is_enabled) VALUES ?
     ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled)`,
    [entries.map(([pref_key, is_enabled]) => [user_id, pref_key, is_enabled])]
  );
};

module.exports = { findByUserId, upsertMany };
