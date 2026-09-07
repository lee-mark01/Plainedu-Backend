// 기술적 지표 순수 계산부 (의존성 0) — DB/Redis/외부 API를 모른다.
// node --test 단위 테스트 대상 (tests/signals.calculator.test.js).
//
// 입력은 오름차순 종가 배열이다(과거 → 최근). chart.service.getDailyCandles가 그 순서로 준다.
// 표본이 모자라면 예외를 던지지 않고 null을 돌려준다 — 신규 상장이나 캐시가 짧은 종목에서
// 지표를 못 내는 건 오류가 아니라 "아직 판단할 수 없음"이다.

const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(Number((value * scale).toPrecision(12))) / scale;
};

// RSI (Wilder, 기본 14일)
//
// Wilder의 원식은 단순 평균이 아니라 지수적 평활이다:
//   첫 평균 = 최초 period개 상승/하락폭의 단순 평균
//   이후    = (직전 평균 × (period-1) + 이번 값) / period
// 단순이동평균으로 계산하면 같은 이름의 다른 지표가 되어 차트 앱과 숫자가 어긋난다.
const rsi = (closes, period = 14) => {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  // 기간 내 하락이 한 번도 없으면 RS가 무한대가 된다. 관례대로 100으로 고정한다.
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;

  const rs = avgGain / avgLoss;
  return round(100 - 100 / (1 + rs));
};

// EMA 전체 시리즈. 첫 값은 최초 period개의 단순 평균으로 시드한다(관례).
const emaSeries = (values, period) => {
  if (values.length < period) return [];

  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const out = [prev];
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
};

// MACD (기본 12, 26, 9)
//
// macd·signal 시리즈의 길이가 달라 그냥 겹치면 시점이 어긋난다. signal은 macd보다
// (signalPeriod - 1)만큼 짧게 시작하므로, 비교 전에 macd의 앞부분을 잘라 끝을 맞춘다.
const macd = (closes, fast = 12, slow = 26, signalPeriod = 9) => {
  if (!Array.isArray(closes) || closes.length < slow + signalPeriod) return null;

  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);

  // emaFast가 (slow - fast)만큼 먼저 시작하므로 그만큼 버려 시점을 맞춘다.
  const offset = emaFast.length - emaSlow.length;
  const macdLine = emaSlow.map((slowVal, i) => emaFast[i + offset] - slowVal);

  const signalLine = emaSeries(macdLine, signalPeriod);
  if (signalLine.length < 2) return null;

  const alignedMacd = macdLine.slice(macdLine.length - signalLine.length);

  const last = alignedMacd.length - 1;
  return {
    macd: round(alignedMacd[last], 4),
    signal: round(signalLine[last], 4),
    histogram: round(alignedMacd[last] - signalLine[last], 4),
    // 골든크로스: 직전 봉에서 signal 아래(또는 같음)였다가 이번 봉에서 위로 올라섬.
    // 값의 크고 작음이 아니라 "막 교차했는가"를 본다 — 이미 한참 위에 있는 종목까지
    // 골든크로스로 잡으면 신호가 매일 뜨고 의미를 잃는다.
    goldenCross:
      alignedMacd[last - 1] <= signalLine[last - 1] && alignedMacd[last] > signalLine[last],
    deadCross:
      alignedMacd[last - 1] >= signalLine[last - 1] && alignedMacd[last] < signalLine[last],
  };
};

// RSI 판정 경계. 30/70은 Wilder의 원래 제안이고 대부분의 차트 앱 기본값이라
// 사용자가 다른 도구에서 본 것과 어긋나지 않는다.
const RSI_OVERSOLD = 30;
const RSI_OVERBOUGHT = 70;

const classifyRsi = (value) => {
  if (value === null) return null;
  if (value <= RSI_OVERSOLD) return 'OVERSOLD';
  if (value >= RSI_OVERBOUGHT) return 'OVERBOUGHT';
  return 'NEUTRAL';
};

module.exports = {
  rsi,
  macd,
  emaSeries,
  classifyRsi,
  RSI_OVERSOLD,
  RSI_OVERBOUGHT,
};
