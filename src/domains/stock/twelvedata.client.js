const axios = require('axios');
const AppError = require('../../errors/AppError');
const { INTRADAY_INTERVALS } = require('../../config/rangeMap');

// Twelve Data REST API
// 문서: https://twelvedata.com/docs#time-series
// 과금: 심볼 1개 조회 = 1크레딧 (outputsize 무관) · 분당 8크레딧 / 일 800크레딧
const BASE_URL = 'https://api.twelvedata.com';

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

  return data; // { meta, values }
};

module.exports = { fetchTimeSeries };
