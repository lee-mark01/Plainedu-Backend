const axios = require('axios');
const AppError = require('../../errors/AppError');
const { INTRADAY_INTERVALS } = require('../../config/rangeMap');
const redis = require('../../config/redis');
const { getEtDateString } = require('../../config/marketHours');
const { DAILY_CREDIT_BUDGET } = require('../../config/marketDataBudget');

// Twelve Data REST API
// 문서: https://twelvedata.com/docs#time-series
// 과금: 심볼 1개 조회 = 1크레딧 (outputsize 무관). 정확한 분당/일일 한도는
// src/config/marketDataBudget.js 참고(코드 주석 값과 설계문서 전제 값이 불일치해 설정값으로 뺐음).
const BASE_URL = 'https://api.twelvedata.com';

const CREDITS_KEY_TTL_SECONDS = 2 * 24 * 60 * 60; // 관측용 — 이틀 후 자동 만료

// 일일 크레딧 사용량 카운터(docs/market-data-strategy.md §7-1④) — 실패해도 요청 자체는 막지 않는다.
// INCR과 EXPIRE를 파이프라인으로 한 번에 보낸다 — "count===1일 때만 EXPIRE"로 나눠서 두 번
// await하면, 그 사이에 프로세스가 죽거나 EXPIRE만 실패했을 때 그날 키가 TTL 없이 영원히 남는다.
// 매번 TTL을 갱신하는 슬라이딩 방식이라 "이틀 후" 기준이 최초 사용이 아니라 마지막 사용 기준으로
// 바뀌지만, 관측용 카운터라 이 차이는 무해하고 대신 누수 가능성이 사라진다.
const recordCreditUsage = async () => {
  try {
    const key = `credits:${getEtDateString()}`;
    const [[, count]] = await redis.multi().incr(key).expire(key, CREDITS_KEY_TTL_SECONDS).exec();
    if (count === DAILY_CREDIT_BUDGET) {
      console.warn(`[TwelveData] 오늘 예상 크레딧 예산(${DAILY_CREDIT_BUDGET}) 도달`);
    }
  } catch (err) {
    console.error('[TwelveData] 크레딧 카운터 갱신 실패(무시):', err.message);
  }
};

// time_series 조회 (라인·캔들 차트 공용 원천)
// endDate: 과거 구간 lazy 로딩용 — 해당 시각(UTC 문자열) 이전 봉을 조회 
// 분봉은 timezone=UTC로 요청 → datetime이 UTC로 와서 unix 변환이 단순해짐 (프론트 계약 B안)
const fetchTimeSeries = async ({ symbol, interval, outputsize, endDate }) => {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) throw new AppError('TWELVEDATA_API_KEY가 설정되지 않았습니다.', 500);

  let data;
  try {
    ({ data } = await axios.get(`${BASE_URL}/time_series`, {
      params: {
        symbol,
        interval,
        outputsize,
        order: 'ASC',
        ...(INTRADAY_INTERVALS.has(interval) && { timezone: 'UTC' }),
        ...(endDate && { end_date: endDate }),
        apikey: apiKey,
      },
      timeout: 15000,
    }));
  } catch (err) {
    if (err.response?.status === 429) {
      throw new AppError('Twelve Data 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.', 429);
    }
    console.error('[TwelveData] time_series 요청 실패:', err.message);
    throw new AppError('시세 제공사에 연결하지 못했습니다.', 503);
  }

  // HTTP 200이어도 body가 { code, message, status: "error" }일 수 있음
  if (data?.status === 'error') {
    const code = Number(data.code);
    if (code === 404) throw new AppError(`존재하지 않는 심볼입니다: ${symbol}`, 404);
    if (code === 429) throw new AppError('Twelve Data 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.', 429);
    console.error('[TwelveData] API 오류:', data.code, data.message);
    throw new AppError('시세 제공사 응답 오류가 발생했습니다.', 502);
  }

  if (!data?.meta || !Array.isArray(data.values)) {
    console.error('[TwelveData] 예상치 못한 응답:', JSON.stringify(data).slice(0, 300));
    throw new AppError('시세 제공사 응답 형식이 올바르지 않습니다.', 502);
  }

  await recordCreditUsage(); // 크레딧이 실제로 소모된 성공 응답만 카운트(429/404/에러 경로는 제외)

  return data; // { meta, values }
};

module.exports = { fetchTimeSeries };
