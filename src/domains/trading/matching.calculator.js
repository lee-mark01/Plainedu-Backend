// 지정가 주문 크로스 조건 판단 (의존성 0 순수 함수) — trading.service.js(즉시체결)와
// matching.service.js(틱 매칭) 양쪽에서 공유. node --test tests/ 단위 테스트 대상.

// BUY: 현재가가 지정가 이하로 내려오면 체결 / SELL: 현재가가 지정가 이상으로 오르면 체결
const checkCrosses = ({ orderType, orderPrice, currentPrice }) =>
  orderType === 'BUY' ? currentPrice <= orderPrice : currentPrice >= orderPrice;

module.exports = { checkCrosses };
