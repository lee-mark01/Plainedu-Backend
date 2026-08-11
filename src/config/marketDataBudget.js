const { parseEnvInt } = require('./env');

// TwelveData 크레딧 예산 — 하드코딩 대신 설정값으로 뺀 이유:
// twelvedata.client.js 주석(구 무료플랜: 분당 8 / 일 800)과
// docs/market-data-strategy.md 설계 전제(유료 플랜: 분당 610 / 일 6,100)가 서로 다르다.
// 실제 계약 플랜의 정확한 값을 코드만으로 확인할 수 없어, 계약 확정 전까지는
// 보수적인 구 무료플랜 값을 기본값으로 두고 env로 덮어쓸 수 있게 한다.
const DAILY_CREDIT_BUDGET = parseEnvInt('TWELVEDATA_DAILY_CREDIT_BUDGET', 800);
const MINUTE_CREDIT_BUDGET = parseEnvInt('TWELVEDATA_MINUTE_CREDIT_BUDGET', 8);

module.exports = { DAILY_CREDIT_BUDGET, MINUTE_CREDIT_BUDGET };
