const { RANGE_MAP, LAZY_INTERVALS, getTtl } = require('../../config/rangeMap');
const { isSymbolMarketOpen, getEtDateString } = require('../../config/marketHours');
const redis = require('../../config/redis');
const twelveDataClient = require('./twelvedata.client');
const chartCache = require('./chart.cache');
const AppError = require('../../errors/AppError');

// Twelve Data 원본 → 프론트 계약 정규화 (스펙 §3)
// - 원본 가격이 문자열이므로 숫자 변환 (소수 반올림은 프론트 담당)
// - 요청은 ASC지만 방어적 재정렬 (datetime 문자열이 'YYYY-MM-DD[ HH:mm:ss]' 포맷이라 사전순 = 시간순)
// - datetime은 거래소 로컬 시각(오프셋 없음) → timezone을 함께 내려 프론트가 해석
const normalize = (raw) => {
  const candles = raw.values
    .map((v) => ({
      time: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: v.volume != null ? parseInt(v.volume, 10) : null,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  return {
    symbol: raw.meta.symbol,
    interval: raw.meta.interval,
    // 크립토/외환은 currency 대신 currency_quote(호가 통화)로 내려옴
    currency: raw.meta.currency ?? raw.meta.currency_quote ?? null,
    timezone: raw.meta.exchange_timezone,
    exchange: raw.meta.exchange,
    candles,
  };
};

// 캐시본에서 마지막 N봉 슬라이스 + 구간 최고/최저 계산 (스펙 §3-4)
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
const getCachedSeries = async (symbol, interval, outputsize) => {
  let series = await chartCache.get(symbol, interval);
  if (!series) {
    const raw = await twelveDataClient.fetchTimeSeries({ symbol, interval, outputsize });
    series = normalize(raw);
    await chartCache.set(symbol, interval, series, getTtl(interval, symbol));
  }
  return series;
};

// GET /api/stocks/:symbol/chart?range=&before=
const getChart = async (symbol, range, before) => {
  const { interval, outputsize, slice } = RANGE_MAP[range];

  // 과거 드래그 lazy 로딩: 분봉만 별도 구간 조회 (일봉 이상은 표준 수집량이 전체 커버, 스펙 §7)
  // 구간별 조회분은 캐시 키(chart:{sym}:{interval}) 오염 방지를 위해 캐싱하지 않는다.
  if (before) {
    if (!LAZY_INTERVALS.has(interval)) {
      throw new AppError(`range=${range}는 과거 구간 조회(before)를 지원하지 않습니다.`, 400);
    }
    const raw = await twelveDataClient.fetchTimeSeries({
      symbol,
      interval,
      outputsize,
      endDate: before,
    });
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

// 전일종가: ET 기준 오늘보다 이전 날짜의 마지막 일봉 close (스펙 §6)
// 장중 캐시에 오늘 봉이 아직 없어도(§10-5) 날짜 비교라 어제 종가를 정확히 집는다.
const getPrevClose = async (symbol) => {
  const candles = await getDailyCandles(symbol);
  const today = getEtDateString();
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    if (candles[i].time.slice(0, 10) < today) return candles[i].close;
  }
  return null;
};

// 현재가 + 등락액/등락률 (스펙 §6: /quote 폴링 없이 가진 재료로 계산)
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
