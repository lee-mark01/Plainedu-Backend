const AppError = require('../../errors/AppError');

const createQaAbuseGuard = ({ store, clock = () => Date.now(), perIpLimit = 5, globalLimit = 50, windowSec = 900 }) => {
  const windowId = () => Math.floor(clock() / 1000 / windowSec);
  const keys = (ip) => [`rl:qa-pin:ip:${ip}:${windowId()}`, `rl:qa-pin:global:${windowId()}`];
  const unavailable = () => new AppError('QA 로그인이 현재 비활성화되어 있습니다.', 503, 'QA_AUTH_UNAVAILABLE');

  return {
    async assertAllowed(ip) {
      let counts;
      try {
        counts = await store.getMany(keys(ip));
      } catch (_error) {
        throw unavailable();
      }
      if (Number(counts[0] || 0) >= perIpLimit || Number(counts[1] || 0) >= globalLimit) {
        throw new AppError('요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.', 429, 'RATE_LIMITED');
      }
    },
    async recordFailure(ip) {
      try {
        await store.incrementMany(keys(ip), windowSec);
      } catch (_error) {
        throw unavailable();
      }
    },
  };
};

let cached;
const getQaAbuseGuard = (config) => {
  if (!cached) {
    const redis = require('../../config/redis');
    const redisStore = {
      getMany: (keys) => redis.mget(...keys),
      async incrementMany(keys, ttl) {
        const transaction = redis.multi();
        for (const key of keys) transaction.incr(key).expire(key, ttl);
        await transaction.exec();
      },
    };
    cached = createQaAbuseGuard({ store: redisStore, globalLimit: config.qaPinGlobalLimit });
  }
  return cached;
};

module.exports = { createQaAbuseGuard, getQaAbuseGuard };
