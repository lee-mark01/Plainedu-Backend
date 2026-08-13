const stockRepository = require('./stock.repository');
const { isSymbolAlwaysOpen } = require('../../config/marketHours');
const { getRealtimeSymbols } = require('../../config/realtimeSymbols');

// "우리가 취급하는 심볼인가" — 외부 시세 API(크레딧 과금)로 요청이 나가기 전의 유일한 관문.
// WS 구독(wsGateway)과 REST 차트/시세(chart.controller)가 이 함수를 공유한다. 한쪽에만 걸면
// 다른 쪽으로 그대로 우회되므로 반드시 같이 지나가야 한다.

const isValidSymbol = async (symbol) => {
  if (isSymbolAlwaysOpen(symbol)) return getRealtimeSymbols().includes(symbol);
  const stock = await stockRepository.findByCode(symbol);
  return !!stock && stock.status === 'ACTIVE';
};

module.exports = { isValidSymbol };
