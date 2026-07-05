require('dotenv').config();

const http = require('http');
const app = require('./app');
const redis = require('./config/redis');
const tokenCleanup = require('./jobs/tokenCleanup');
const marketData = require('./marketData');

const PORT = process.env.PORT || 3000;

// Socket.IO를 같은 포트에 붙이기 위해 http 서버를 직접 생성
const server = http.createServer(app);
marketData.start(server);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  tokenCleanup.start();
});

// graceful shutdown: 업스트림 WS·Socket.IO·Redis 정리 후 종료
const shutdown = (signal) => {
  console.log(`\n[${signal}] 서버 종료 중...`);
  marketData.stop();
  redis.quit().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref(); // 연결이 안 닫히면 강제 종료
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
