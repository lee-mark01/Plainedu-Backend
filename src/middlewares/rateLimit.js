const redis = require('../config/redis');
const AppError = require('../errors/AppError');

const rateLimit = (name, limit, windowSec) => async (req, res, next) => {
  const id = req.user?.userId ?? req.ip;
  const key = `rl:${name}:${id}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  try {
    const [[, count]] = await redis.multi().incr(key).expire(key, windowSec).exec();
    if (count > limit) {
      res.set('Retry-After', String(windowSec));
      return next(new AppError('요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.', 429, 'RATE_LIMITED'));
    }
  } catch (error) {
    console.error(`[rateLimit:${name}] Redis 실패(통과시킴):`, error.message);
  }
  next();
};

module.exports = rateLimit;
