// 실시간 시세(WebSocket 틱) 수신 확인용 스크립트
//
// 사용법:
//   node scripts/watch-prices.js                  # .env의 REALTIME_SYMBOLS 그대로 구독
//   node scripts/watch-prices.js AAPL BTC/USD      # 심볼 직접 지정
//
// 종료: Ctrl+C
//
// ⚠️ 주의: 같은 TWELVEDATA_API_KEY로 동시에 열 수 있는 WebSocket 연결은 1개뿐입니다.
// npm run dev(메인 서버)가 이미 떠 있는 상태에서 이 스크립트를 같이 실행하면
// 두 연결이 서로 계속 끊기고 재연결을 반복합니다 (code 1006). 메인 서버를 잠깐 내려두고 쓰세요.
require('dotenv').config();

const { createUpstream } = require('../src/marketData/wsUpstream');
const { getRealtimeSymbols } = require('../src/config/realtimeSymbols');

const symbols = process.argv.slice(2).length ? process.argv.slice(2) : getRealtimeSymbols();

console.log(`구독 심볼: ${symbols.join(', ')}`);

let tickCount = 0;
const upstream = createUpstream({
  getSymbols: () => symbols,
  onTick: (tick) => {
    tickCount += 1;
    const time = new Date(tick.timestamp * 1000).toLocaleTimeString('ko-KR');
    console.log(`[${time}] ${tick.symbol.padEnd(8)} ${tick.price}  (누적 ${tickCount}건)`);
  },
  onReconnect: () => console.log('[재연결됨 — 그 사이 틱은 유실됨]'),
});

upstream.connect();

process.on('SIGINT', () => {
  console.log(`\n총 ${tickCount}건 수신, 종료합니다.`);
  upstream.close();
  process.exit(0);
});
