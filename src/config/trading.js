// 모의투자 계좌 초기값 (실제 기획 확정값 아님 — 임시 placeholder, env로 조정 가능)
const INITIAL_CASH_INDIVIDUAL = Number(process.env.INITIAL_CASH_INDIVIDUAL) || 100000;
const INITIAL_CASH_TEAM = Number(process.env.INITIAL_CASH_TEAM) || 100000;

// 시즌이 하나도 없을 때 자동 생성할 기본 기간
const DEFAULT_SEASON_DURATION_DAYS = Number(process.env.DEFAULT_SEASON_DURATION_DAYS) || 90;

module.exports = { INITIAL_CASH_INDIVIDUAL, INITIAL_CASH_TEAM, DEFAULT_SEASON_DURATION_DAYS };
