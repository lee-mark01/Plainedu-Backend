const { createUpstream } = require('./wsUpstream');
const tickProcessor = require('./tickProcessor');
const wsGateway = require('./wsGateway');

// 실시간 시세 파이프라인 조립 (스펙 §5)
// Twelve Data WS ─(연결 1개)→ tickProcessor(price:{sym} 갱신 + 등락률) → Socket.IO 브로드캐스트

// 무료 플랜 WS 한도 8종목 이내로 유지할 것
const DEFAULT_SYMBOLS = 'AAPL,BTC/USD,EUR/USD';

let upstream = null;

const getSymbols = () =>
  (process.env.REALTIME_SYMBOLS || DEFAULT_SYMBOLS)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

const start = (httpServer) => {
  const symbols = getSymbols();

  // 게이트웨이는 업스트림 가동 여부와 무관하게 열어둔다 (프론트 연결 계약 유지)
  wsGateway.init(httpServer, { allowedSymbols: symbols });

  if (!process.env.TWELVEDATA_API_KEY) {
    console.warn('[marketData] TWELVEDATA_API_KEY 미설정 → 실시간 시세 비활성화');
    return;
  }

  upstream = createUpstream({
    symbols,
    onTick: async (tick) => {
      try {
        const payload = await tickProcessor.processTick(tick);
        wsGateway.broadcastTick(payload);
      } catch (err) {
        console.error('[marketData] 틱 처리 실패:', err.message);
      }
    },
    onReconnect: () => wsGateway.broadcastResync(symbols),
  });
  upstream.connect();
};

const stop = () => {
  upstream?.close();
  upstream = null;
  wsGateway.close();
};

module.exports = { start, stop };
