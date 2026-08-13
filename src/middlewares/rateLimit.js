const redis = require('../config/redis');
const AppError = require('../errors/AppError');

// 고정 윈도우 카운터. 키에 윈도우 번호를 박아 윈도우가 바뀌면 키 자체가 바뀐다
// → 매 요청 EXPIRE를 갱신해도 윈도우가 밀리지 않고(계속 두들기는 클라이언트가 영구히 막히지 않음),
//   TTL 없는 키가 남을 여지도 없다. EXPIRE NX(Redis 7+)에 의존하지 않으려는 이유이기도 하다.
//
// 식별자는 로그인 사용자면 userId, 아니면 IP. IP를 쓰려면 app.js의 trust proxy 설정이 필수다
// (nginx 뒤에서는 그게 없으면 전원이 127.0.0.1 하나로 묶여 서로의 한도를 잡아먹는다).
//
// Redis가 죽으면 통과시킨다 — 부가 방어층 장애가 로그인 자체를 막는 게 더 나쁘다.
// ponytail: 단일 Redis 전제. 앱 서버를 여러 대로 늘려도 카운터는 공유되므로 그대로 동작한다.
const rateLimit = (name, limit, windowSec) => async (req, res, next) => {
  const id = req.user?.userId ?? req.ip;
  const key = `rl:${name}:${id}:${Math.floor(Date.now() / 1000 / windowSec)}`;

  try {
    const [[, count]] = await redis.multi().incr(key).expire(key, windowSec).exec();
    if (count > limit) {
      res.set('Retry-After', String(windowSec));
      return next(new AppError('요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.', 429, 'RATE_LIMITED'));
    }
  } catch (err) {
    console.error(`[rateLimit:${name}] Redis 실패(통과시킴):`, err.message);
  }

  next();
};

module.exports = rateLimit;
