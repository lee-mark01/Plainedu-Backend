const redis = require('../config/redis');
const chartService = require('../domains/stock/chart.service');

// 틱 처리 
// 1) price:{symbol} 덮어쓰기 — 차트용이 아니라 trading/portfolio 등 타 도메인이 읽는 공용 현재가
// 2) 전일종가 대비 등락액/등락률 계산 → 게이트웨이가 그대로 브로드캐스트

// 장중 틱이 끊긴 뒤 오래된 가격이 최신처럼 읽히지 않도록 만료시킨다
const PRICE_TTL_SECONDS = Number(process.env.PRICE_TTL_SECONDS) || 60;

// 전일종가는 하루 단위로만 바뀌므로 메모리에 두고 주기 갱신 (1day 캐시 재조회 부담 제거)
const PREV_CLOSE_REFRESH_MS = 5 * 60_000;
const prevCloseCache = new Map(); // symbol → { value, fetchedAt }

const getPrevClose = async (symbol) => {
  const hit = prevCloseCache.get(symbol);
  if (hit && Date.now() - hit.fetchedAt < PREV_CLOSE_REFRESH_MS) return hit.value;

  try {
    const value = await chartService.getPrevClose(symbol);
    prevCloseCache.set(symbol, { value, fetchedAt: Date.now() });
    return value;
  } catch (err) {
    console.error(`[tickProcessor] ${symbol} 전일종가 조회 실패:`, err.message);
    return hit?.value ?? null; // 만료된 값이라도 있으면 사용
  }
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
