const { Server } = require('socket.io');
const { isValidSymbol } = require('../domains/stock/symbol');
const { parseEnvInt } = require('../config/env');
const subscriptions = require('./subscriptions');

// Socket.IO 게이트웨이
// 유저는 우리 서버에만 접속해 종목 room에 join하고, 서버가 가공한 틱을 받는다.
// 이벤트 계약은 docs/stock-chart.md 참고.

const MAX_VIEW_PER_SOCKET = parseEnvInt('WS_MAX_VIEW_PER_SOCKET', 5);

let io = null;

// 심볼 검증은 REST 차트와 공유한다 — domains/stock/symbol.js 참고.

const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: '*' }, // app.js의 cors() 전체 허용 정책과 동일
  });

  io.on('connection', (socket) => {
    const viewedSymbols = new Set(); // 이 소켓이 확정 구독한 심볼 — disconnect 시 이걸로만 정리
    const pendingValidations = new Map(); // symbol -> Promise<boolean> (검증 중인 심볼, 동시 요청 dedup용)

    socket.on('subscribe', async (payload = {}) => {
      const symbol = String(payload.symbol || '').trim().toUpperCase();
      if (!symbol) return;

      if (viewedSymbols.has(symbol)) {
        socket.join(symbol); // 재연결 등으로 room만 다시 필요한 경우
        socket.emit('subscribed', { symbol });
        return;
      }

      // 같은 심볼에 대한 요청이 이미 검증 중이면(중복 이벤트 등) 새로 검증하지 않고 그 결과를
      // 공유한다 — 그렇지 않으면 두 번째 요청이 "아직 확정 안 됐으니 새 요청"으로 처리되면서
      // size 체크를 또 통과하거나, 반대로 "이미 있음"으로 오인해 검증 실패 전에 subscribed를
      // 먼저 응답해버리는 불일치가 생긴다.
      const inFlight = pendingValidations.get(symbol);
      if (inFlight) {
        const valid = await inFlight;
        if (!socket.connected) return; // 대기 중 연결이 끊겼으면 room join/emit 자체가 의미 없음
        if (valid) {
          socket.join(symbol);
          socket.emit('subscribed', { symbol });
        } else {
          socket.emit('subscribe-error', { symbol, message: '실시간 시세를 제공하지 않는 종목입니다.' });
        }
        return;
      }

      // 검증 중인 것까지 합쳐서 제한을 셈 — 그렇지 않으면 서로 다른 심볼 여러 개를 짧은 시간에
      // 연달아 요청할 때 전부 size 체크를 통과한 뒤에야 확정되면서 소켓당 제한을 우회한다(TOCTOU).
      if (viewedSymbols.size + pendingValidations.size >= MAX_VIEW_PER_SOCKET) {
        socket.emit('subscribe-error', {
          symbol,
          message: `소켓당 최대 ${MAX_VIEW_PER_SOCKET}종목까지 구독할 수 있습니다.`,
        });
        return;
      }

      const validation = isValidSymbol(symbol).catch((err) => {
        console.error('[wsGateway] 심볼 검증 실패:', err.message);
        return false;
      });
      pendingValidations.set(symbol, validation);
      const valid = await validation;
      pendingValidations.delete(symbol);

      // 검증 대기 중 소켓이 끊기면 disconnect 핸들러가 이미 지나간 뒤이므로, 여기서 태그를
      // 붙이면 아무도 정리해주지 않는 영구 누수가 된다 — 끊긴 소켓이면 그냥 조용히 종료.
      if (!socket.connected) return;

      if (!valid) {
        socket.emit('subscribe-error', {
          symbol,
          message: '실시간 시세를 제공하지 않는 종목입니다.',
        });
        return;
      }

      viewedSymbols.add(symbol);
      subscriptions.add(symbol, `view:${socket.id}`);
      socket.join(symbol);
      socket.emit('subscribed', { symbol });
    });

    socket.on('unsubscribe', (payload = {}) => {
      const symbol = String(payload.symbol || '').trim().toUpperCase();
      if (!symbol || !viewedSymbols.has(symbol)) return;
      viewedSymbols.delete(symbol);
      subscriptions.remove(symbol, `view:${socket.id}`);
      socket.leave(symbol);
    });

    // 탭을 닫는 등 정상 unsubscribe 없이 끊어져도 이 소켓이 건 view 태그를 전부 정리한다
    // (기존엔 이 핸들러 자체가 없어서 태그가 영원히 안 풀리는 슬롯 누수였음).
    socket.on('disconnect', () => {
      viewedSymbols.forEach((symbol) => subscriptions.remove(symbol, `view:${socket.id}`));
      viewedSymbols.clear();
    });
  });

  return io;
};

// 가공된 틱을 해당 종목 room에 전파
const broadcastTick = (payload) => {
  io?.to(payload.symbol).emit('price', payload);
};

// 업스트림 재연결 후 프론트에 차트 재조회 신호 (공백 구간 틱은 복구 불가)
const broadcastResync = (symbols) => {
  symbols.forEach((symbol) => io?.to(symbol).emit('resync', { symbol }));
};

const close = () => {
  io?.close();
  io = null;
};

module.exports = { init, broadcastTick, broadcastResync, close };
