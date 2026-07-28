// 일일 스냅샷 수동 트리거 (Task 8 검증·장애 시 당일 재실행용)
// 16:05 ET 크론이 실패한 날 이걸로 재실행하면 UPSERT 멱등이라 안전하게 복구된다.
//
// 사용법:
//   node scripts/run-daily-snapshot.js
require('dotenv').config();

const pool = require('../src/config/db');
const redis = require('../src/config/redis');
const { snapshotDailyRankings } = require('../src/domains/ranking/ranking.service');

(async () => {
  try {
    const result = await snapshotDailyRankings();
    if (!result) {
      console.log('활성 시즌 없음 — 스냅샷 skip');
      process.exitCode = 0;
      return;
    }
    console.log('스냅샷 완료:', JSON.stringify(result));

    const [rows] = await pool.query(
      `SELECT target_type, COUNT(*) AS cnt,
              SUM(alignment_score IS NULL) AS align_null,
              SUM(participation_rate IS NULL) AS part_null
       FROM DailyRankings WHERE season_id = ? AND rank_date = ?
       GROUP BY target_type`,
      [result.season_id, result.rank_date]
    );
    console.table(rows);
    process.exitCode = 0;
  } catch (err) {
    console.error('스냅샷 실패:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
    await redis.quit().catch(() => {});
  }
})();
