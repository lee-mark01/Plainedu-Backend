// 랭킹 재계산 수동 트리거 (초반 검증용 — 스케줄러 연결 전까지 이걸로 갱신)
//
// 사용법:
//   node scripts/recompute-rankings.js            # 활성 시즌 (없으면 자동 생성)
//   node scripts/recompute-rankings.js 3          # 시즌 id 지정
require('dotenv').config();

const pool = require('../src/config/db');
const redis = require('../src/config/redis');
const rankingCache = require('../src/domains/ranking/ranking.cache');
const { recomputeRankings } = require('../src/domains/ranking/ranking.service');

(async () => {
  const seasonId = process.argv[2] ? Number(process.argv[2]) : undefined;
  try {
    const summary = await recomputeRankings(seasonId);
    console.log('재계산 완료:', JSON.stringify(summary));

    const raw = await redis.zrevrange(rankingCache.boardKey(summary.season_id, 'individual'), 0, 19, 'WITHSCORES');
    const top = [];
    for (let i = 0; i < raw.length; i += 2) {
      top.push({ rank: i / 2 + 1, user_id: raw[i], score: Number(raw[i + 1]) });
    }
    console.table(top);
    process.exitCode = 0;
  } catch (err) {
    console.error('재계산 실패:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
    redis.disconnect();
  }
})();
