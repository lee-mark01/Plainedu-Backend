const redis = require('../config/redis');
const chartService = require('../domains/stock/chart.service');

// 틱 처리 
// 1) price:{symbol} 덮어쓰기 — 차트용이 아니라 trading/portfolio 등 타 도메인이 읽는 공용 현재가
// 2) 전일종가 대비 등락액/등락률 계산 → 게이트웨이가 그대로 브로드캐스트

// 장중 틱이 끊긴 뒤 오래된 가격이 최신처럼 읽히지 않도록 만료시킨다
const PRICE_TTL_SECONDS = Number(process.env.PRICE_TTL_SECONDS) || 60;

// 전일종가는 하루 단위로만 바뀌므로 메모리에 두고 주기 갱신 (1day 캐시 재조회 부담 제거)
// 실패도 쿨다운으로 기록한다 — 안 그러면 429(한도 초과) 동안 매 틱이 API를 재시도하는 폭풍이 됨
const PREV_CLOSE_REFRESH_MS = 5 * 60_000;
const FAIL_COOLDOWN_MS = 60_000;
const prevCloseCache = new Map(); // symbol → { value, fetchedAt, failed }
const inflight = new Map(); // symbol → Promise (동시 틱의 중복 호출 방지)

const getPrevClose = async (symbol) => {
  const hit = prevCloseCache.get(symbol);
  if (hit) {
    const maxAge = hit.failed ? FAIL_COOLDOWN_MS : PREV_CLOSE_REFRESH_MS;
    if (Date.now() - hit.fetchedAt < maxAge) return hit.value;
  }

  let pending = inflight.get(symbol);
  if (!pending) {
    pending = chartService
      .getPrevClose(symbol)
      .then((value) => {
        prevCloseCache.set(symbol, { value, fetchedAt: Date.now(), failed: false });
        return value;
      })
      .catch((err) => {
        console.error(`[tickProcessor] ${symbol} 전일종가 조회 실패(${FAIL_COOLDOWN_MS / 1000}초 후 재시도):`, err.message);
        const stale = hit?.value ?? null; // 만료된 값이라도 있으면 사용
        prevCloseCache.set(symbol, { value: stale, fetchedAt: Date.now(), failed: true });
        return stale;
      })
      .finally(() => inflight.delete(symbol));
    inflight.set(symbol, pending);
  }
  return pending;
};

// WS price 이벤트 → 브로드캐스트 페이로드
// 반올림은 프론트 담당이므로 원시 숫자 그대로 전달 
const processTick = async (tick) => {
  const { symbol, price, timestamp } = tick;

  try {
    await redis.set(
      `price:${symbol}`,
      JSON.stringify({
        symbol,
        price,
        timestamp, // Unix timestamp (UTC, 초) — REST의 로컬 시각과 다름 주의
        currency: tick.currency ?? tick.currency_quote ?? null, // 크립토/외환은 currency_quote
        exchange: tick.exchange ?? null,
        dayVolume: tick.day_volume ?? null,
      }),
      'EX',
      PRICE_TTL_SECONDS
    );
  } catch (err) {
    console.error(`[tickProcessor] price:${symbol} 갱신 실패:`, err.message);
  }

  const prevClose = await getPrevClose(symbol);
  const change = prevClose != null ? price - prevClose : null;

  return {
    symbol,
    price,
    change,
    changePercent: prevClose ? (change / prevClose) * 100 : null,
    timestamp,
  };
};

module.exports = { processTick };
