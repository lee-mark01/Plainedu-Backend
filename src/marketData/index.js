const { createUpstream } = require('./wsUpstream');
const tickProcessor = require('./tickProcessor');
const wsGateway = require('./wsGateway');
const subscriptions = require('./subscriptions');
const { getRealtimeSymbols } = require('../config/realtimeSymbols');

// 실시간 시세 파이프라인 조립
// Twelve Data WS ─(연결 1개)→ tickProcessor(price:{sym} 갱신 + 등락률) → Socket.IO 브로드캐스트 → priceUpdate 리스너
//
// 구독 집합은 더 이상 고정 목록이 아니라 subscriptions.js(태그 레지스트리)가 동적으로 관리한다.
// core(=getRealtimeSymbols())는 항상 유지, held/view는 rankingScheduler·wsGateway가 각각 add/remove한다.

let upstream = null;

// marketData는 src/domains/를 직접 require하지 않는다.
// 관심 있는 도메인(예: trading)은 여기 등록해두고, 매 틱마다 (symbol, price)로 호출받는다.
const priceListeners = new Set();
const onPriceUpdate = (handler) => priceListeners.add(handler);

const start = (httpServer) => {
  const coreSymbols = getRealtimeSymbols();

  // subscriptions.init을 먼저 호출해도 안전하다 — onSubscribe/onUnsubscribe가 `upstream` 변수를
  // 클로저로 참조(대입은 뒤에서)하므로 조립 순서에 의존하지 않는다.
  subscriptions.init({
    core: coreSymbols,
    onSubscribe: (symbols) => upstream?.subscribe(symbols),
    onUnsubscribe: (symbols) => upstream?.unsubscribe(symbols),
  });

  // 게이트웨이는 업스트림 가동 여부와 무관하게 열어둔다 (프론트 연결 계약 유지)
  wsGateway.init(httpServer);

  if (!process.env.TWELVEDATA_API_KEY) {
    console.warn('[marketData] TWELVEDATA_API_KEY 미설정 → 실시간 시세 비활성화');
    return;
  }

  upstream = createUpstream({
    getSymbols: () => subscriptions.list(),
    isCoreSymbol: (symbol) => coreSymbols.includes(symbol),
    onTick: async (tick) => {
      try {
        const payload = await tickProcessor.processTick(tick);
        wsGateway.broadcastTick(payload);
        for (const listener of priceListeners) {
          try {
            await listener(payload.symbol, payload.price);
          } catch (err) {
            console.error('[marketData] priceUpdate 리스너 실패:', err.message);
          }
        }
      } catch (err) {
        console.error('[marketData] 틱 처리 실패:', err.message);
      }
    },
    onReconnect: (symbols) => wsGateway.broadcastResync(symbols),
  });
  upstream.connect();
};

const stop = () => {
  upstream?.close();
  upstream = null;
  wsGateway.close();
  subscriptions.reset();
};

module.exports = { start, stop, onPriceUpdate };
