// REALTIME_SYMBOLS 파싱을 한 곳에서만 하도록 분리
// (marketData와 trading 도메인이 같은 심볼 목록을 공유해야 하기 때문)
const DEFAULT_SYMBOLS = 'AAPL,BTC/USD,EUR/USD';

const getRealtimeSymbols = () =>
  (process.env.REALTIME_SYMBOLS || DEFAULT_SYMBOLS)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

module.exports = { getRealtimeSymbols };
