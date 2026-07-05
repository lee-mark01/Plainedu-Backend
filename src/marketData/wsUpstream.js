const WebSocket = require('ws');

// Twelve Data WebSocket 업스트림 
// 서버가 연결 1개만 유지하고 전 종목을 구독한다 — API 키 보호 + 무료 플랜 연결 한도 대응.
// 무료 플랜 한도: 최대 8종목, REST 크레딧과 별도.
const WS_BASE = 'wss://ws.twelvedata.com/v1/quotes/price';
const HEARTBEAT_INTERVAL_MS = 10_000;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

// onTick(priceEvent): price 이벤트 수신 콜백
// onReconnect(): 재연결 성공 콜백 — 공백 구간 동안의 틱은 복구 불가하므로 재싱크 트리거용 
const createUpstream = ({ symbols, onTick, onReconnect }) => {
  let ws = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let closedByUs = false;

  const startHeartbeat = () => {
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'heartbeat' }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  };

  const stopHeartbeat = () => {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };

  const handleMessage = (msg) => {
    switch (msg.event) {
      case 'price':
        onTick(msg);
        break;
      case 'subscribe-status': {
        // 플랜에 따라 일부 심볼이 거부될 수 있음 → success/fails가 실제 화이트리스트 (스파이크 RESULT.md)
        const ok = (msg.success || []).map((s) => s.symbol);
        console.log('[wsUpstream] 구독 성공:', ok.join(', ') || '없음');
        if (msg.fails?.length) {
          console.warn('[wsUpstream] 구독 실패:', msg.fails.map((f) => f.symbol).join(', '));
        }
        break;
      }
      case 'heartbeat':
        break;
      default:
        break;
    }
  };

  const connect = () => {
    const apiKey = process.env.TWELVEDATA_API_KEY;
    ws = new WebSocket(`${WS_BASE}?apikey=${apiKey}`);

    ws.on('open', () => {
      const isReconnect = reconnectAttempts > 0;
      reconnectAttempts = 0;
      console.log(`[wsUpstream] 연결 성공 — 구독 요청: ${symbols.join(', ')}`);
      ws.send(JSON.stringify({ action: 'subscribe', params: { symbols: symbols.join(',') } }));
      startHeartbeat();
      if (isReconnect) onReconnect?.();
    });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      handleMessage(msg);
    });

    ws.on('error', (err) => {
      console.error('[wsUpstream] 오류:', err.message);
    });

    ws.on('close', (code) => {
      stopHeartbeat();
      if (closedByUs) return;
      // 지수 백오프 재연결
      const delay = Math.min(BASE_BACKOFF_MS * 2 ** reconnectAttempts, MAX_BACKOFF_MS);
      reconnectAttempts += 1;
      console.warn(`[wsUpstream] 연결 종료(code ${code}) → ${delay / 1000}초 후 재연결 (${reconnectAttempts}회차)`);
      reconnectTimer = setTimeout(connect, delay);
    });
  };

  const close = () => {
    closedByUs = true;
    clearTimeout(reconnectTimer);
    stopHeartbeat();
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  };

  return { connect, close };
};

module.exports = { createUpstream };
