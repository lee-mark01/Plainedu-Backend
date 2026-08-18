const test = require('node:test');
const assert = require('node:assert/strict');

const { closeSeedResources } = require('../db/seeds/seed-resources');

test('시드 종료 시 DB와 Redis 핸들을 모두 닫는다', async () => {
  const calls = [];
  await closeSeedResources({
    pool: { end: async () => calls.push('pool.end') },
    redis: { disconnect: () => calls.push('redis.disconnect') },
  });
  assert.deepEqual(calls, ['pool.end', 'redis.disconnect']);
});

test('DB 종료가 실패해도 Redis 핸들은 남기지 않는다', async () => {
  let disconnected = false;
  await assert.rejects(
    closeSeedResources({
      pool: { end: async () => { throw new Error('pool close failed'); } },
      redis: { disconnect: () => { disconnected = true; } },
    }),
    /pool close failed/
  );
  assert.equal(disconnected, true);
});
