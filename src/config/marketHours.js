// 미국 정규장(NYSE/NASDAQ) 개장 여부 판단
// ET(America/New_York) 기준 월~금 09:30 ~ 16:00. 서머타임은 타임존 변환이 흡수.
// 알려진 한계: 미국 공휴일 미반영 → TTL이 불필요하게 짧아지는 정도의 영향만 있음 

const ET_TIMEZONE = 'America/New_York';
const OPEN_MINUTES = 9 * 60 + 30; // 09:30
const CLOSE_MINUTES = 16 * 60; // 16:00

const isMarketOpen = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekday = get('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  // hour12:false에서 자정이 '24'로 나오는 런타임 대응
  const hour = Number(get('hour')) % 24;
  const minutes = hour * 60 + Number(get('minute'));
  return minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;
};

// 24/7 마켓 여부 — 크립토/외환은 페어 표기(BTC/USD, EUR/USD)라 슬래시로 구분
const isSymbolAlwaysOpen = (symbol) => typeof symbol === 'string' && symbol.includes('/');

// 심볼 기준 개장 여부: 24/7 마켓은 항상 개장, 미국 주식은 정규장 시간
const isSymbolMarketOpen = (symbol) => isSymbolAlwaysOpen(symbol) || isMarketOpen();

// ET 기준 오늘 날짜 문자열 (YYYY-MM-DD) — 전일종가 판별 등에 사용
const getEtDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

module.exports = { isMarketOpen, isSymbolAlwaysOpen, isSymbolMarketOpen, getEtDateString };
