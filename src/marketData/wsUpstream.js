const WebSocket = require('ws');

// Twelve Data WebSocket 업스트림
// 서버가 연결 1개만 유지하고 태그 기반으로 구독 집합이 동적으로 바뀐다(subscriptions.js가 관리).
// 무료 플랜 한도: 최대 8종목, REST 크레딧과 별도.
const WS_BASE = 'wss://ws.twelvedata.com/v1/quotes/price';
const HEARTBEAT_INTERVAL_MS = 10_000;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

// getSymbols(): 그 순간의 최신 구독 집합을 반환하는 콜백 — 클로저로 고정된 배열을 쓰지 않음으로써
// 재연결 시에도 최초 목록이 아니라 "지금" 구독돼 있어야 할 전체 집합을 재전송한다(§7-1②).
// isCoreSymbol(symbol): core 심볼 여부 — 실패 시 로그 레벨 분리용.
// onTick(priceEvent): price 이벤트 수신 콜백
// onReconnect(symbols): 재연결 성공 콜백 — 공백 구간 동안의 틱은 복구 불가하므로 재싱크 트리거용
const createUpstream = ({ getSymbols, isCoreSymbol = () => false, onTick, onReconnect }) => {
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
          const failSymbols = msg.fails.map((f) => f.symbol);
          const coreFails = failSymbols.filter(isCoreSymbol);
          const otherFails = failSymbols.filter((s) => !isCoreSymbol(s));
          // core 심볼 거절은 상폐/오타/플랜 미지원 등 사람이 봐야 하는 비정상 상황이라 로그 레벨을 분리
          if (coreFails.length) {
            console.error('[wsUpstream] core 심볼 구독 실패(요금제/한도 확인 필요):', coreFails.join(', '));
          }
          if (otherFails.length) {
            console.warn('[wsUpstream] 구독 실패:', otherFails.join(', '));
          }
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
      const symbols = getSymbols(); // 매 open마다 "지금" 최신 집합을 다시 읽음 — 재연결 시 고정 목록 문제 해결
      console.log(`[wsUpstream] 연결 성공 — 구독 요청: ${symbols.join(', ')}`);
      if (symbols.length) {
        ws.send(JSON.stringify({ action: 'subscribe', params: { symbols: symbols.join(',') } }));
      }
      startHeartbeat();
      if (isReconnect) onReconnect?.(symbols);
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

  // 런타임 구독/해제 — subscriptions.js가 배치로 호출한다. 연결이 없으면 조용히 no-op —
  // 다음 open 때 getSymbols()가 최신 상태를 자체적으로 재전송하므로 별도 재시도 큐가 필요 없다.
  const subscribe = (symbols) => {
    if (!symbols?.length || ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ action: 'subscribe', params: { symbols: symbols.join(',') } }));
  };

  const unsubscribe = (symbols) => {
    if (!symbols?.length || ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ action: 'unsubscribe', params: { symbols: symbols.join(',') } }));
  };

  return { connect, close, subscribe, unsubscribe };
};

module.exports = { createUpstream };
