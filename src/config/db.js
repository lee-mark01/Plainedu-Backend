const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// 트랜잭션 헬퍼 — fn(conn)이 던지면 롤백, 정상 종료면 커밋하고 반환값을 그대로 넘긴다.
// (수동 getConnection/beginTransaction 패턴과 동작 동일. learning 도메인이 사용)
const withTransaction = async (fn) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};

// 기본 export는 pool 그대로 (21개 repository가 `const pool = require('./config/db')`로 쓴다).
// withTransaction은 프로퍼티로 붙여 `const { withTransaction } = require('./config/db')`도 되게 한다.
// ⚠️ `const { pool } = require('./config/db')`는 금물 — mysql2 내부의 콜백형 코어 풀이 잡혀서
//    `const [rows] = await pool.query(...)`가 터진다.
module.exports = pool;
module.exports.withTransaction = withTransaction;
