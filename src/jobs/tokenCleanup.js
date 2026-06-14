const cron = require('node-cron');
const { deleteExpiredTokens } = require('../domains/auth/auth.repository');

const start = () => {
  // 매일 새벽 3시 실행
  cron.schedule('0 3 * * *', async () => {
    const count = await deleteExpiredTokens();
    console.log(`[tokenCleanup] 만료 토큰 ${count}개 삭제`);
  });
};

module.exports = { start };
