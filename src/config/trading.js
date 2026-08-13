// 모의투자 계좌 초기값 (실제 기획 확정값 아님 — 임시 placeholder, env로 조정 가능)
const INITIAL_CASH_INDIVIDUAL = Number(process.env.INITIAL_CASH_INDIVIDUAL) || 100000;
const INITIAL_CASH_TEAM = Number(process.env.INITIAL_CASH_TEAM) || 100000;

// 시즌 기간은 분기 달력이 정한다 (account.service.quarterSeasonOf) — 설정값 없음.

module.exports = { INITIAL_CASH_INDIVIDUAL, INITIAL_CASH_TEAM };
