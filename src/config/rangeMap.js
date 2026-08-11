// range → interval/outputsize 매핑 단일 진실원천
// 기간 뷰 = interval × outputsize 조합. interval당 수집량은 1가지로 고정하고
// 캐시 키를 chart:{symbol}:{interval}로 공유한다-

const { isSymbolMarketOpen } = require('./marketHours');

const RANGE_MAP = {
  '1D': { interval: '5min', outputsize: 78 },
  '1W': { interval: '30min', outputsize: 65 },
  // 3M은 자체 수집 없이 1day(1Y) 캐시의 마지막 63봉 슬라이스
  '3M': { interval: '1day', outputsize: 365, slice: 63 },
  '1Y': { interval: '1day', outputsize: 365 },
  '5Y': { interval: '1week', outputsize: 300 },
  ALL: { interval: '1month', outputsize: 5000 },
};

const RANGES = Object.keys(RANGE_MAP);

// 분봉 집합. 분봉만: lazy 로딩(과거 드래그) 지원 + UTC로 요청해 time을 unix 초로 변환
// (일봉 이상은 표준 수집량이 전체를 커버하고, time이 날짜 문자열이라 그대로 차트에 꽂힘)
const INTRADAY_INTERVALS = new Set(['5min', '30min']);

// 장중 TTL(초): 신규 봉 생성 지점의 데이터 구멍 방지 목적 -
// '1day' 900(15분)은 docs/market-data-strategy.md §6-2 — 구독 종목의 현재가는 WS 틱이 담당하므로
// 이 TTL은 3M/1Y 차트와 미구독 종목 getQuote에만 영향(미구독 종목 지연이 5분→15분으로 늘어남).
const OPEN_TTL = {
  '5min': 30,
  '30min': 60,
  '1day': 900,
  '1week': 3600,
  '1month': 3600,
};

// 장마감 TTL(초): 확정 봉 불변 → 재호출 크레딧 낭비 방지
const CLOSED_TTL = 1800;

// 크립토/외환(BTC/USD 등)은 24/7 거래라 항상 장중 TTL 적용
const getTtl = (interval, symbol) => {
  return isSymbolMarketOpen(symbol) ? OPEN_TTL[interval] : CLOSED_TTL;
};

module.exports = { RANGE_MAP, RANGES, INTRADAY_INTERVALS, getTtl };
