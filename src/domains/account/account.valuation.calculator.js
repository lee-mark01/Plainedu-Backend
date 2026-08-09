// 계좌 평가 순수 계산부 (의존성 0) 
// DB/가격조회를 모르는 순수 함수라 node --test 단위 테스트 대상 (tests/account.valuation.test.js)

// 부동소수 오차 보정 반올림 (1000.005 × 100 = 100000.4999… 같은 케이스 방지)
const round = (value, digits) => {
  const scale = 10 ** digits;
  return Math.round(Number((value * scale).toPrecision(12))) / scale;
};
const money = (v) => round(v, 2); // D7: 금액 소수 2자리
const rate = (v) => round(v, 4); // D7: 수익률·비중·pnl_rate 소수 4자리

// buildValuation({ initial_cash, cash_balance, holdings, priceMap }) → 스펙 §4.1 반환 스키마
// - holdings: [{ stock_code, quantity, average_buy_price }] (DECIMAL 문자열 허용)
// - priceMap: { 심볼: 가격 | null } — null/누락이면 평단가 대체 + stale 표시 (D4 단건 정책)
const buildValuation = ({ initial_cash, cash_balance, holdings, priceMap }) => {
  const initialCash = Number(initial_cash);
  const cashBalance = Number(cash_balance);

  const staleSymbols = [];
  const evaluated = (holdings || []).map((h) => {
    const quantity = Number(h.quantity);
    const averageBuyPrice = Number(h.average_buy_price);
    const marketPrice = priceMap?.[h.stock_code];
    const stale = marketPrice == null;
    if (stale) staleSymbols.push(h.stock_code);

    const currentPrice = stale ? averageBuyPrice : Number(marketPrice);
    const value = currentPrice * quantity;
    const cost = averageBuyPrice * quantity;
    const pnl = value - cost;

    return {
      stock_code: h.stock_code,
      quantity,
      average_buy_price: money(averageBuyPrice),
      current_price: money(currentPrice),
      price_stale: stale,
      value: money(value),
      pnl: money(pnl),
      pnl_rate: cost > 0 ? rate((pnl / cost) * 100) : null,
      rawValue: value, // weight 계산용 (아래에서 제거)
    };
  });

  const totalEquity = cashBalance + evaluated.reduce((sum, h) => sum + h.rawValue, 0);
  const hasWeight = totalEquity > 0;

  const resultHoldings = evaluated.map(({ rawValue, ...h }) => ({
    ...h,
    weight: hasWeight ? rate((rawValue / totalEquity) * 100) : null,
  }));

  return {
    total_equity: money(totalEquity),
    return_rate: initialCash > 0 ? rate(((totalEquity - initialCash) / initialCash) * 100) : null,
    cash_balance: money(cashBalance),
    cash_weight: hasWeight ? rate((cashBalance / totalEquity) * 100) : null,
    has_stale_prices: staleSymbols.length > 0,
    stale_symbols: staleSymbols,
    holdings: resultHoldings,
  };
};

module.exports = { buildValuation };
