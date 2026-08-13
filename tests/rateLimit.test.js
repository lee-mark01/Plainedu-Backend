// 레이트리밋 미들웨어 검증 — 실제 Redis를 쓴다(DB·외부 API는 안 탄다).
const test = require('node:test');
const assert = require('node:assert');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');

require('dotenv').config({ quiet: true });
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret';

const app = require('../src/app');
const redis = require('../src/config/redis');
const pool = require('../src/config/db');

let server;
let base;

test.before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  redis.disconnect();
  await pool.end().catch(() => {});
});

test('한도를 넘으면 429 + RATE_LIMITED, 넘기 전까지는 통과한다', async () => {
  const userId = Math.floor(Math.random() * 1e9);
  const token = jwt.sign({ userId, role: 'USER' }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });

  const call = () =>
    fetch(`${base}/api/auth/email/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });

  for (let i = 1; i <= 10; i += 1) {
    const res = await call();
    assert.notStrictEqual(res.status, 429, `${i}번째 요청이 한도(10) 안인데 막혔다`);
  }

  const blocked = await call();
  assert.strictEqual(blocked.status, 429, '11번째 요청은 막혀야 한다');
  assert.strictEqual((await blocked.json()).code, 'RATE_LIMITED');
  assert.strictEqual(blocked.headers.get('retry-after'), '300');
});

test('식별자가 다르면 한도를 공유하지 않는다', async () => {
  const other = jwt.sign(
    { userId: Math.floor(Math.random() * 1e9), role: 'USER' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '5m' }
  );
  const res = await fetch(`${base}/api/auth/email/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${other}` },
    body: JSON.stringify({}),
  });
  assert.notStrictEqual(res.status, 429);
});
