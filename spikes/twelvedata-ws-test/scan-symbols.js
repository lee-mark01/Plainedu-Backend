require('dotenv').config();
const WebSocket = require('ws');

const API_KEY = process.env.TWELVEDATA_API_KEY;
if (!API_KEY || API_KEY === 'your_api_key_here') {
  console.error('[ERROR] .env 파일에 TWELVEDATA_API_KEY를 설정해주세요.');
  process.exit(1);
}

const WS_URL = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${API_KEY}`;

// ── 후보 심볼 ──
const CANDIDATES = [
  'ETH/USD', 'LTC/USD', 'XRP/USD', 'SOL/USD',
  'DOGE/USD', 'ADA/USD', 'BCH/USD', 'LINK/USD',
  'BNB/USD', 'DOT/USD', 'AVAX/USD', 'MATIC/USD',
];

const CHUNK_SIZE = 5;
const CHUNK_DELAY_MS = 2000;

const successSymbols = [];
const failedSymbols = [];

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function testChunk(symbols, chunkIndex, totalChunks) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      console.log(`\n[chunk ${chunkIndex + 1}/${totalChunks}] 구독 요청: ${symbols.join(', ')}`);
      ws.send(JSON.stringify({
        action: 'subscribe',
        params: { symbols: symbols.join(',') }
      }));
    });

    ws.on('message', (data) => {
      let msg;

      try {
        msg = JSON.parse(data.toString());
      } catch (err) {
        console.error('  [PARSE ERROR]', data.toString());
        return;
      }

      if (msg.event === 'subscribe-status') {
        if (msg.success) {
          for (const s of msg.success) {
            successSymbols.push(s.symbol);
            console.log(`  ✓ ${s.symbol} (${s.exchange}, ${s.type})`);
          }
        }
        if (msg.fails) {
          for (const f of msg.fails) {
            failedSymbols.push(f.symbol);
            console.log(`  ✗ ${f.symbol}`);
          }
        }

        // reset 후 종료
        ws.send(JSON.stringify({ action: 'reset' }));
      }

      if (msg.event === 'reset-status') {
        ws.close();
      }

      if (msg.event === 'price') {
        console.log(`  [price] ${msg.symbol} $${msg.price}`);
      }
    });

    ws.on('error', (err) => {
      console.error(`  [ERROR] ${err.message}`);
    });

    ws.on('close', () => {
      resolve();
    });
  });
}

async function main() {
  console.log('=== Twelve Data WebSocket Symbol Scan ===');
  console.log(`후보: ${CANDIDATES.length}개 | chunk size: ${CHUNK_SIZE}\n`);

  const chunks = chunk(CANDIDATES, CHUNK_SIZE);

  for (let i = 0; i < chunks.length; i++) {
    await testChunk(chunks[i], i, chunks.length);
    if (i < chunks.length - 1) {
      console.log(`\n  (${CHUNK_DELAY_MS / 1000}초 대기...)`);
      await sleep(CHUNK_DELAY_MS);
    }
  }

  console.log('\n=== 스캔 결과 ===\n');
  console.log(`성공 (${successSymbols.length}개):`);
  if (successSymbols.length) {
    console.log(`  ${successSymbols.join(', ')}`);
  } else {
    console.log('  (없음)');
  }

  console.log(`\n실패 (${failedSymbols.length}개):`);
  if (failedSymbols.length) {
    console.log(`  ${failedSymbols.join(', ')}`);
  } else {
    console.log('  (없음)');
  }

  console.log('\n=== 완료 ===');
}

main();
