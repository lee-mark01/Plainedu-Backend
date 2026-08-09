const Redis = require('ioredis');

// 앱 전체 공유 Redis 연결 1개 (chart 캐시, price:{symbol}, fx 등 전 도메인 공용)
// REDIS_URL 예: redis://localhost:6379
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: false,
  maxRetriesPerRequest: 1, // Redis 다운 시 캐시 호출이 빨리 실패하고 폴백하도록
  retryStrategy: (times) => Math.min(times * 500, 10_000),
});

redis.on('error', (err) => {
  // ECONNREFUSED는 AggregateError로 와서 message가 비어 있을 수 있음
  console.error('[Redis] 연결 오류:', err.message || err.code || err.errors?.[0]?.code || 'unknown');
});

redis.on('ready', () => {
  console.log('[Redis] 연결 완료');
});

module.exports = redis;
