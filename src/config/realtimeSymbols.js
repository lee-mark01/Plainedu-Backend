// REALTIME_SYMBOLS 파싱을 한 곳에서만 하도록 분리
// (marketData와 trading 도메인이 같은 심볼 목록을 공유해야 하기 때문)
//
// 코어 실시간 구독 심볼 — 운영 정책상 항상 WS 구독을 유지하는 고정 목록
// (docs/market-data-strategy.md §4 core — 런타임 변경 API 없음, 배열 수정 후 재배포).
// TODO: 팀 확정 core 목록(§3-5 demand ZSET 기반 최대 200종목)으로 교체.
const CORE_SYMBOLS = ['AAPL', 'BTC/USD', 'EUR/USD'];

// 로컬 개발 편의로 REALTIME_SYMBOLS env가 있으면 CORE_SYMBOLS를 완전히 대체한다.
const parseEnvOverride = () =>
  (process.env.REALTIME_SYMBOLS || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

const getRealtimeSymbols = () => {
  const override = parseEnvOverride();
  return override.length ? override : [...CORE_SYMBOLS];
};

module.exports = { getRealtimeSymbols, CORE_SYMBOLS };
