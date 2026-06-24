require('dotenv').config();
const WebSocket = require('ws');

const API_KEY = process.env.TWELVEDATA_API_KEY;
if (!API_KEY || API_KEY === 'your_api_key_here') {
  console.error('[ERROR] .env 파일에 TWELVEDATA_API_KEY를 설정해주세요.');
  process.exit(1);
}

const WS_URL = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${API_KEY}`;

let ws;
let heartbeatInterval;
let priceCount = 0;
const latestPriceMap = new Map();
const SYMBOLS = process.env.SYMBOLS || 'AAPL';

// ── 1단계: WebSocket 연결 ──
function connect() {
  console.log('[1/5] WebSocket 연결 시도...');
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    console.log('[1/5] 연결 성공\n');
    subscribe();
  });

  ws.on('message', (data) => {
  const raw = data.toString();
  console.log('\n[RAW]', raw);

  try {
    const msg = JSON.parse(raw);
    handleMessage(msg);
  } catch (err) {
    console.error('[ERROR] JSON 파싱 실패:', err.message);
  }
});

  ws.on('error', (err) => {
    console.error('[ERROR] WebSocket 오류:', err.message);
  });

  ws.on('close', (code, reason) => {
    const closeReason = reason ? reason.toString() : 'N/A';
    console.log(`\n[CLOSE] 연결 종료 (code: ${code}, reason: ${closeReason})`);
    clearInterval(heartbeatInterval);
  });
}

// ── 2단계: subscribe ──
function subscribe() {
  console.log(`[2/5] ${SYMBOLS} 구독 요청...`);
  ws.send(JSON.stringify({
    action: 'subscribe',
    params: {
      symbols: SYMBOLS
    }
  }));
}

// ── 3단계: heartbeat (10초 간격) ──
function startHeartbeat() {
  console.log('[3/5] Heartbeat 시작 (10초 간격)\n');
  heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'heartbeat' }));
      console.log(`  [HEARTBEAT] 전송 @ ${new Date().toLocaleTimeString()}`);
    }
  }, 10_000);
}

// ── 4단계: unsubscribe ──
function unsubscribe() {
  console.log(`\n[4/5] ${SYMBOLS} 구독 해제 요청...`);
  ws.send(JSON.stringify({
    action: 'unsubscribe',
    params: {
      symbols: SYMBOLS
    }
  }));
}

// ── 5단계: reset ──
function reset() {
  console.log('[5/5] 전체 구독 초기화(reset) 요청...');
  ws.send(JSON.stringify({ action: 'reset' }));
}

// ── 메시지 핸들러 ──
function handleMessage(msg) {
  switch (msg.event) {
    case 'subscribe-status':
      console.log(`[SUBSCRIBE] status: ${msg.status}`);
      if (msg.success) console.log('  success:', msg.success);
      if (msg.fails && msg.fails.length) console.log('  fails:', msg.fails);
      
      if (!msg.success || msg.success.length === 0) {
        console.log('\n[INFO] 구독 성공한 심볼이 없어 테스트를 종료합니다.');
        ws.close();
        break;
      }

      startHeartbeat();
      console.log('\n  → 30초간 가격 수신 후 unsubscribe 테스트 진행\n');
      setTimeout(() => unsubscribe(), 30_000);
      break;

    case 'unsubscribe-status':
      console.log(`[UNSUBSCRIBE] status: ${msg.status}`);
      if (msg.success) console.log('  success:', msg.success);
      if (msg.fails && msg.fails.length) console.log('  fails:', msg.fails);
      // 3초 후 reset 테스트
      setTimeout(() => reset(), 3_000);
      break;

    case 'reset-status':
      console.log(`[RESET] status: ${msg.status}`);
      // 테스트 완료 → 정리
      console.log('\n=== 모든 테스트 완료 ===');
      clearInterval(heartbeatInterval);
      ws.close();
      break;

    case 'price':
      priceCount++;
      latestPriceMap.set(msg.symbol, {
        symbol: msg.symbol,
        price: msg.price,
        timestamp: msg.timestamp,
        lastTickAt: new Date().toISOString(),
        source: 'TWELVE_DATA_WS',
        exchange: msg.exchange,
        currency: msg.currency,
        type: msg.type,
        dayVolume: msg.day_volume
      });
      console.log(
        `  [PRICE #${priceCount}] ${msg.symbol} $${msg.price}` +
        ` | vol: ${msg.day_volume} | ${new Date(msg.timestamp * 1000).toLocaleTimeString()}`
        
      );
      break;

    case 'heartbeat':
      console.log(`  [HEARTBEAT] 응답 수신`);
      break;

    default:
      console.log('[UNKNOWN]', JSON.stringify(msg, null, 2));
  }
}

process.on('SIGINT', () => {
  console.log('\n[EXIT] Ctrl+C 감지. WebSocket 종료 중...');
  clearInterval(heartbeatInterval);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }

  process.exit(0);
});

// ── 실행 ──
console.log('=== Twelve Data WebSocket Spike Test ===\n');
console.log('테스트 흐름: 연결 → 구독 → 30초 가격수신 → 구독해제 → 리셋 → 종료\n');
connect();
