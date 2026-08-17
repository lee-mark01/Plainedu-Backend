const AppError = require('../../errors/AppError');

const createQaAbuseGuard = ({ store, clock = () => Date.now(), perIpLimit = 5, globalLimit = 50, windowSec = 900 }) => {
  const windowId = () => Math.floor(clock() / 1000 / windowSec);
  const keys = (ip) => [`rl:qa-pin:ip:${ip}:${windowId()}`, `rl:qa-pin:global:${windowId()}`];
  const unavailable = () => new AppError('QA 로그인이 현재 비활성화되어 있습니다.', 503, 'QA_AUTH_UNAVAILABLE');

  return {
    async reserve(ip) {
      const reservationKeys = keys(ip);
      let allowed;
      try {
        allowed = await store.reserve(reservationKeys, { perIpLimit, globalLimit, windowSec });
      } catch (_error) {
        throw unavailable();
      }
      if (!allowed) {
        throw new AppError('요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.', 429, 'RATE_LIMITED');
      }
      return reservationKeys;
    },
    async release(reservationKeys) {
      try {
        await store.release(reservationKeys);
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
      reserve: (keys, { perIpLimit, globalLimit, windowSec }) => redis.eval(
        `local ip = tonumber(redis.call('GET', KEYS[1]) or '0')
         local global = tonumber(redis.call('GET', KEYS[2]) or '0')
         if ip >= tonumber(ARGV[1]) or global >= tonumber(ARGV[2]) then return 0 end
         redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], ARGV[3])
         redis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], ARGV[3])
         return 1`,
        2, ...keys, perIpLimit, globalLimit, windowSec
      ),
      release: (keys) => redis.eval(
        `for i = 1, #KEYS do
           local value = tonumber(redis.call('GET', KEYS[i]) or '0')
           if value > 0 then redis.call('DECR', KEYS[i]) end
         end
         return 1`,
        keys.length, ...keys
      ),
    };
    cached = createQaAbuseGuard({ store: redisStore, globalLimit: config.qaPinGlobalLimit });
  }
  return cached;
};

module.exports = { createQaAbuseGuard, getQaAbuseGuard };
