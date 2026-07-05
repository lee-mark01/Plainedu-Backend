const redis = require('../../config/redis');

// 차트 캐시-
// 키: chart:{symbol}:{interval} — interval당 수집량이 1가지라 outputsize는 키에 넣지 않는다.
// Redis 장애 시 캐시 없이 진행(외부 API 직행)하도록 조회/저장 실패를 삼킨다.

const buildKey = (symbol, interval) => `chart:${symbol}:${interval}`;

const get = async (symbol, interval) => {
  try {
    const raw = await redis.get(buildKey(symbol, interval));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('[chartCache] 조회 실패(캐시 없이 진행):', err.message);
    return null;
  }
};

const set = async (symbol, interval, data, ttlSeconds) => {
  try {
    await redis.set(buildKey(symbol, interval), JSON.stringify(data), 'EX', ttlSeconds);
  } catch (err) {
    console.error('[chartCache] 저장 실패:', err.message);
  }
};

module.exports = { get, set };
