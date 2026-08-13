const accountService = require('./account.service');
const { getAccountValuation } = require('./account.valuation');

// 계좌 요약 + 보유종목 평가 — 개인(/accounts/me)과 팀(/teams/me/account)이 같은 응답 형태를 쓴다.
// 프론트가 상단 Scope 토글에서 같은 컴포넌트를 재사용할 수 있도록 스키마를 일부러 일치시킴.
// account.service가 아니라 여기 있는 이유는 account.service 상단 주석 참조(redis 로드 부작용).
const buildAccountSummary = async (account) => {
  const { holdings, ...valuation } = await getAccountValuation(account.id);
  return {
    account: {
      id: account.id,
      account_type: account.account_type,
      season_id: account.season_id,
      initial_cash: Number(account.initial_cash),
      cash_balance: valuation.cash_balance,
      total_equity: valuation.total_equity,
      return_rate: valuation.return_rate,
      cash_weight: valuation.cash_weight,
      has_stale_prices: valuation.has_stale_prices,
    },
    holdings,
  };
};

// GET /api/accounts/me — 계좌 요약 + 보유종목 평가손익
// 계좌가 없으면 로그인 시와 동일한 getOrCreate 흐름으로 빈 계좌를 만들어 정상 응답한다 (500 금지).
const getMyAccount = async (req, res, next) => {
  try {
    const account = await accountService.getOrCreateIndividualAccount(req.user.userId);
    res.json({ success: true, data: await buildAccountSummary(account) });
  } catch (err) {
    next(err);
  }
};

// GET /api/accounts/me/history?season_id= — 자산(수익률) 추이 그래프 (PI-01)
// season_id 생략 시 현재 시즌(기존 동작). 과거 시즌은 계좌를 **조회만** 한다 —
// 그 시즌에 계좌가 없으면(미참여) 404가 아니라 빈 items로 응답한다 — 그래프가 비는 게 정상 상태.
const getMyAccountHistory = async (req, res, next) => {
  try {
    const seasonId = req.validated?.season_id;
    const account = seasonId
      ? await accountService.getIndividualAccountForSeason(req.user.userId, seasonId)
      : await accountService.getOrCreateIndividualAccount(req.user.userId);

    if (!account) {
      return res.json({ success: true, data: { account_id: null, season_id: seasonId, items: [] } });
    }
    res.json({ success: true, data: await accountService.getAssetHistory(account) });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMyAccount, getMyAccountHistory, buildAccountSummary };
