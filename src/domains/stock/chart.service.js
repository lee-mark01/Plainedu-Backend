const { RANGE_MAP, INTRADAY_INTERVALS, getTtl } = require('../../config/rangeMap');
const { isSymbolMarketOpen, getEtDateString } = require('../../config/marketHours');
const redis = require('../../config/redis');
const twelveDataClient = require('./twelvedata.client');
const chartCache = require('./chart.cache');
const AppError = require('../../errors/AppError');

// Twelve Data 원본 → 프론트 계약 정규화-
// - 원본 가격이 문자열이므로 숫자 변환 (소수 반올림은 프론트 담당)
// - 요청은 ASC지만 방어적 재정렬 (datetime 문자열이 'YYYY-MM-DD[ HH:mm:ss]' 포맷이라 사전순 = 시간순)
// - time 포맷은 Lightweight Charts 입력 규격에 맞춤:
//   일봉 이상 = 'YYYY-MM-DD' 문자열 그대로 / 분봉 = unix 초(UTC로 요청했으므로 단순 변환)
//   → 분봉 time이 WS 틱 timestamp와 같은 기준이 되어 프론트 변환 불필요
const normalize = (raw) => {
  const isIntraday = INTRADAY_INTERVALS.has(raw.meta.interval);
  const candles = raw.values
    .slice()
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
    .map((v) => ({
      time: isIntraday ? Date.parse(v.datetime.replace(' ', 'T') + 'Z') / 1000 : v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: v.volume != null ? parseInt(v.volume, 10) : null,
    }));

  return {
    symbol: raw.meta.symbol,
    interval: raw.meta.interval,
    // 크립토/외환은 currency 대신 currency_quote(호가 통화)로 내려옴
    currency: raw.meta.currency ?? raw.meta.currency_quote ?? null,
    // 분봉은 UTC로 요청해서 meta에 exchange_timezone이 안 옴 → time 기준 그대로 'UTC' 명시
    timezone: isIntraday ? 'UTC' : (raw.meta.exchange_timezone ?? null),
    exchange: raw.meta.exchange,
    candles,
  };
};

// 캐시본에서 마지막 N봉 슬라이스 + 구간 최고/최저 계산 
const buildResponse = (normalized, range, sliceCount) => {
  const candles = sliceCount
    ? normalized.candles.slice(-sliceCount)
    : normalized.candles;

  return {
    ...normalized,
    range,
    candles,
    high: candles.length ? Math.max(...candles.map((c) => c.high)) : null,
    low: candles.length ? Math.min(...candles.map((c) => c.low)) : null,
  };
};

// cache-aside: 캐시 미스 시에만 외부 API 호출 (interval당 1크레딧)
// 같은 키를 동시에 미스한 요청들은 한 번의 API 호출을 공유한다 (캐시 스탬피드 → 크레딧 낭비 방지)
// 실패는 전원에게 그대로 전파되고 엔트리가 지워지므로 다음 요청이 재시도한다
const inflightFetch = new Map(); // `${symbol}:${interval}` → Promise

const getCachedSeries = async (symbol, interval, outputsize) => {
  const cached = await chartCache.get(symbol, interval);
  if (cached) return cached;

  const key = `${symbol}:${interval}`;
  let pending = inflightFetch.get(key);
  if (!pending) {
    pending = twelveDataClient
      .fetchTimeSeries({ symbol, interval, outputsize })
      .then(async (raw) => {
        const series = normalize(raw);
        await chartCache.set(symbol, interval, series, getTtl(interval, symbol));
        return series;
      })
      .finally(() => inflightFetch.delete(key));
    inflightFetch.set(key, pending);
  }
  return pending;
};

// GET /api/stocks/:symbol/chart?range=&before=
const getChart = async (symbol, range, before) => {
  const { interval, outputsize, slice } = RANGE_MAP[range];

  // 과거 드래그 lazy 로딩: 분봉만 별도 구간 조회 (일봉 이상은 표준 수집량이 전체 커버)
  // before = 프론트가 보유한 가장 오래된 봉의 time(unix 초) 그대로.
  // 구간별 조회분은 캐시 키(chart:{sym}:{interval}) 오염 방지를 위해 캐싱하지 않는다.
  if (before) {
    if (!INTRADAY_INTERVALS.has(interval)) {
      throw new AppError(`range=${range}는 과거 구간 조회(before)를 지원하지 않습니다.`, 400);
    }
    // 분봉 요청이 timezone=UTC이므로 end_date도 UTC 문자열로 변환해 짝을 맞춘다
    const endDate = new Date(before * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const raw = await twelveDataClient.fetchTimeSeries({ symbol, interval, outputsize, endDate });
    const normalized = normalize(raw);
    // end_date가 경계 봉을 포함할 수 있어 프론트 보유분과 겹치지 않게 제거
    normalized.candles = normalized.candles.filter((c) => c.time < before);
    return buildResponse(normalized, range);
  }

  const series = await getCachedSeries(symbol, interval, outputsize);
  return buildResponse(series, range, slice);
};

// 일봉 시리즈 (전일종가·마지막 종가 재료 — 1Y 캐시 공유, 추가 크레딧 0)
const getDailyCandles = async (symbol) => {
  const { interval, outputsize } = RANGE_MAP['1Y'];
  const series = await getCachedSeries(symbol, interval, outputsize);
  return series.candles;
};

// 전일종가: ET 기준 오늘보다 이전 날짜의 마지막 일봉 close 
// 장중 캐시에 오늘 봉이 아직 없어도(§10-5) 날짜 비교라 어제 종가를 정확히 집는다.
const getPrevClose = async (symbol) => {
  const candles = await getDailyCandles(symbol);
  const today = getEtDateString();
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    if (candles[i].time.slice(0, 10) < today) return candles[i].close;
  }
  return null;
};

// 현재가 + 등락액/등락률 (quote 폴링 없이 가진 재료로 계산)
// 현재가: 장중 = WS 틱(price:{symbol}) / 그 외 = 일봉 마지막 close
const getQuote = async (symbol) => {
  const candles = await getDailyCandles(symbol);
  if (!candles.length) throw new AppError(`시세 데이터가 없습니다: ${symbol}`, 404);

  let price = null;
  let timestamp = null;
  let source = 'close';

  try {
    const raw = await redis.get(`price:${symbol}`);
    if (raw) {
      const tick = JSON.parse(raw);
      price = tick.price;
      timestamp = tick.timestamp; // Unix timestamp (UTC, 초)
      source = 'ws';
    }
  } catch (err) {
    console.error('[chartService] price 키 조회 실패:', err.message);
  }

  let prevClose;
  if (source === 'ws') {
    prevClose = await getPrevClose(symbol);
  } else {
    const last = candles[candles.length - 1];
    price = last.close;
    timestamp = last.time; // 거래소 로컬 날짜 문자열
    prevClose = candles.length >= 2 ? candles[candles.length - 2].close : null;
  }

  const change = prevClose != null ? price - prevClose : null;
  return {
    symbol,
    price,
    prevClose,
    change,
    changePercent: prevClose ? (change / prevClose) * 100 : null,
    timestamp,
    source,
    marketOpen: isSymbolMarketOpen(symbol),
  };
};

module.exports = { getChart, getQuote, getPrevClose };
