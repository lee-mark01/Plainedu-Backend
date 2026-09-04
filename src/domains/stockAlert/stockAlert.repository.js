const pool = require('../../config/db');

const ALERT_TYPES = ['TARGET_PRICE', 'STOP_LOSS', 'DAILY_CHANGE', 'VOLUME'];

// 설정한 조건만 돌려준다. 미설정 항목을 빈 값으로 채우지 않는 이유는 프론트가 기본 4개
// 항목에 합쳐 그리기 때문이다 — 서버가 채우면 "설정함"과 "값이 0"이 구분되지 않는다.
const findByUserAndStock = async (user_id, stock_code, executor = pool) => {
  const [rows] = await executor.query(
    `SELECT type, threshold, is_enabled, updated_at
     FROM StockAlerts
     WHERE user_id = ? AND stock_code = ?
     ORDER BY FIELD(type, 'TARGET_PRICE', 'STOP_LOSS', 'DAILY_CHANGE', 'VOLUME')`,
    [user_id, stock_code]
  );
  return rows;
};

// 종목 하나의 조건 집합을 통째로 교체한다.
//
// 왜 삭제 후 삽입인가: PUT은 "이 종목의 알림 설정은 이게 전부다"라는 뜻이라, 요청에 없는
// 종류는 해제된 것으로 봐야 한다. UPSERT만 하면 지난번에 켜둔 조건이 남아 요청을 그대로
// 다시 보내도 결과가 달라진다(멱등하지 않음).
//
// 한 트랜잭션인 이유: 지우고 넣는 사이에 끊기면 설정이 통째로 사라진다.
const replaceForStock = async (user_id, stock_code, alerts, conn) => {
  await conn.query('DELETE FROM StockAlerts WHERE user_id = ? AND stock_code = ?', [
    user_id,
    stock_code,
  ]);

  if (!alerts.length) return;

  await conn.query(
    `INSERT INTO StockAlerts (user_id, stock_code, type, threshold, is_enabled) VALUES ?`,
    [alerts.map((a) => [user_id, stock_code, a.type, a.threshold, a.is_enabled])]
  );
};

const stockExists = async (stock_code, executor = pool) => {
  const [rows] = await executor.query('SELECT stock_code FROM Stocks WHERE stock_code = ? LIMIT 1', [
    stock_code,
  ]);
  return rows.length > 0;
};

// 토큰은 기기에 딸린 값이라 token이 유일하다. 이미 등록된 토큰이 다른 계정으로 들어오면
// 소유자를 옮긴다 — 기기에서 계정을 바꿔 로그인한 상황이고, 그대로 두면 이전 계정의 알림이
// 이 기기로 계속 간다.
const upsertPushToken = async (user_id, token, platform, executor = pool) => {
  await executor.query(
    `INSERT INTO PushTokens (user_id, token, platform) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform)`,
    [user_id, token, platform]
  );
};

module.exports = {
  ALERT_TYPES,
  findByUserAndStock,
  replaceForStock,
  stockExists,
  upsertPushToken,
};
