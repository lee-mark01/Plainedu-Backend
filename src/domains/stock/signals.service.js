const redis = require('../../config/redis');
const chartService = require('./chart.service');
const signalsRepository = require('./signals.repository');
const { rsi, macd, classifyRsi, RSI_OVERSOLD } = require('./signals.calculator');

// 투자 홈에 띄울 신호 목록 (요청 16).
//
// 신호 세 종류를 낸다 — 인기 종목 / RSI 과매도 / MACD 골든크로스.
// (backend-handoff.md P1의 "인기 종목, RSI 저평가, MACD 골든크로스"에 대응)
//
// 계산 재료는 일봉이다. chart.service.getDailyCandles가 1Y 캐시를 공유하므로 캐시가 더우면
// 추가 크레딧이 들지 않는다. 대신 캐시가 비었을 때를 대비해 **순차로 돌리고 실패한 종목은
// 건너뛴다** — 한 종목이 외부 API 한도에 걸렸다고 화면 전체가 비면 안 된다.
const CACHE_KEY = 'stock:signals:v1';
const CACHE_TTL_SECONDS = 15 * 60;
const POPULAR_COUNT = 5;

// 지표는 일봉 기준이라 분 단위로 바뀌지 않는다. 15분 캐시면 투자 홈을 여러 번 들락거려도
// 재계산이 없고, 하루치 크레딧도 종목 수만큼만 쓴다.
const readCache = async () => {
  try {
    const raw = await redis.get(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // 캐시 장애가 신호 조회를 막지 않는다
  }
};

const writeCache = async (payload) => {
  try {
    await redis.set(CACHE_KEY, JSON.stringify(payload), 'EX', CACHE_TTL_SECONDS);
  } catch {
    // 캐시 실패는 무시 — 다음 요청이 다시 계산한다
  }
};

// 종목 하나의 지표. 재료가 모자라거나 조회가 실패하면 null이고, 호출부가 건너뛴다.
const analyzeSymbol = async (stock) => {
  let candles;
  try {
    candles = await chartService.getDailyCandles(stock.stock_code);
  } catch (err) {
    console.warn(`[signals] ${stock.stock_code} 일봉 조회 실패(건너뜀):`, err.message);
    return null;
  }
  if (!candles?.length) return null;

  const closes = candles.map((c) => c.close);
  return {
    stock_code: stock.stock_code,
    name: stock.name,
    popularity: Number(stock.popularity),
    rsi: rsi(closes),
    macd: macd(closes),
    // 지표가 어느 봉까지 반영했는지. 요청 16이 요구한 "기준 시각"이 이것이다 —
    // 계산 시각만 주면 오래된 봉으로 만든 값을 방금 만든 것처럼 보여주게 된다.
    based_on: candles[candles.length - 1].time,
  };
};

const buildSignals = (analyzed) => {
  const signals = [];

  // 인기 종목 — 우리 사용자 기준(관심목록·글 태그). 인기도가 0이면 아무도 안 본 종목이라 뺀다.
  analyzed
    .filter((a) => a.popularity > 0)
    .slice(0, POPULAR_COUNT)
    .forEach((a) => {
      signals.push({
        type: 'POPULAR',
        stock_code: a.stock_code,
        name: a.name,
        value: a.popularity,
        based_on: a.based_on,
        source: 'community',
      });
    });

  analyzed.forEach((a) => {
    if (a.rsi !== null && classifyRsi(a.rsi) === 'OVERSOLD') {
      signals.push({
        type: 'RSI_OVERSOLD',
        stock_code: a.stock_code,
        name: a.name,
        value: a.rsi,
        threshold: RSI_OVERSOLD,
        based_on: a.based_on,
        source: 'daily_candles',
      });
    }

    if (a.macd?.goldenCross) {
      signals.push({
        type: 'MACD_GOLDEN_CROSS',
        stock_code: a.stock_code,
        name: a.name,
        value: a.macd.histogram,
        based_on: a.based_on,
        source: 'daily_candles',
      });
    }
  });

  return signals;
};

const getSignals = async () => {
  const cached = await readCache();
  if (cached) return { ...cached, cached: true };

  const universe = await signalsRepository.findUniverse();

  // 순차 처리. 캐시가 비었을 때 동시에 쏘면 외부 API 분당 한도에 걸려 전부 실패할 수 있다.
  const analyzed = [];
  for (const stock of universe) {
    const result = await analyzeSymbol(stock);
    if (result) analyzed.push(result);
  }

  const payload = {
    // 계산을 돌린 시각. 개별 신호의 based_on(마지막 봉)과 구분된다 —
    // 둘 다 있어야 "언제 계산했고 어느 시점 데이터인가"가 분명해진다.
    as_of: new Date().toISOString(),
    analyzed_count: analyzed.length,
    signals: buildSignals(analyzed),
  };

  await writeCache(payload);
  return { ...payload, cached: false };
};

module.exports = { getSignals, buildSignals, analyzeSymbol, CACHE_KEY, CACHE_TTL_SECONDS, POPULAR_COUNT };
