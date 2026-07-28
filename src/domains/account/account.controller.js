const accountService = require('./account.service');
const { getAccountValuation } = require('./account.valuation');

// GET /api/accounts/me — 계좌 요약 + 보유종목 평가손익 
// 계좌가 없으면 로그인 시와 동일한 getOrCreate 흐름으로 빈 계좌를 만들어 정상 응답한다 (500 금지).
const getMyAccount = async (req, res, next) => {
  try {
    const account = await accountService.getOrCreateIndividualAccount(req.user.userId);
    const { holdings, ...valuation } = await getAccountValuation(account.id);
    res.json({
      success: true,
      data: {
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
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMyAccount };
