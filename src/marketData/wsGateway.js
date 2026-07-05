const { Server } = require('socket.io');

// Socket.IO 게이트웨이 (스펙 §5)
// 유저는 우리 서버에만 접속해 종목 room에 join하고, 서버가 가공한 틱을 받는다.
// 이벤트 계약은 docs/stock-chart.md 참고.

let io = null;

const init = (httpServer, { allowedSymbols }) => {
  const allowed = new Set(allowedSymbols);

  io = new Server(httpServer, {
    cors: { origin: '*' }, // app.js의 cors() 전체 허용 정책과 동일
  });

  io.on('connection', (socket) => {
    socket.on('subscribe', (payload = {}) => {
      const symbol = String(payload.symbol || '').toUpperCase();
      if (!allowed.has(symbol)) {
        socket.emit('subscribe-error', {
          symbol,
          message: '실시간 시세를 제공하지 않는 종목입니다.',
        });
        return;
      }
      socket.join(symbol);
      socket.emit('subscribed', { symbol });
    });

    socket.on('unsubscribe', (payload = {}) => {
      socket.leave(String(payload.symbol || '').toUpperCase());
    });
  });

  return io;
};

// 가공된 틱을 해당 종목 room에 전파
const broadcastTick = (payload) => {
  io?.to(payload.symbol).emit('price', payload);
};

// 업스트림 재연결 후 프론트에 차트 재조회 신호 (공백 구간 틱은 복구 불가, 스펙 §10-2)
const broadcastResync = (symbols) => {
  symbols.forEach((symbol) => io?.to(symbol).emit('resync', { symbol }));
};

const close = () => {
  io?.close();
  io = null;
};

module.exports = { init, broadcastTick, broadcastResync, close };
