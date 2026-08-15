// 라우터 배선 검증 — "인증이 필요한 라우트에 authenticate가 실제로 붙어 있는가".
//
// 유닛테스트가 못 잡는 유일한 종류의 버그를 노린다: 로직은 멀쩡한데 미들웨어를 빠뜨려서
// 아무나 호출할 수 있게 된 경우(실제로 GET /api/users에서 발생 — 맨 아래 참고).
//
// DB·Redis·TwelveData를 쓰지 않는다. authenticate가 토큰을 보고 401을 내는 시점은
// 컨트롤러 진입 전이라, 라우트 목록에 경로를 한 줄 추가하는 것만으로 검증이 끝난다.
// 새 엔드포인트를 만들면 아래 PROTECTED에 한 줄 추가하는 것을 습관으로.

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
  server = app.listen(0); // 0 = 빈 포트 자동 할당 (실행 중인 개발 서버와 충돌하지 않음)
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  redis.disconnect(); // ioredis는 재연결 타이머를 물고 있어 명시적으로 끊어야 프로세스가 종료된다
  await pool.end().catch(() => {});
});

// 토큰 없이 호출하면 반드시 401이어야 하는 라우트 전부.
const PROTECTED = [
  ['GET', '/api/accounts/me'],
  ['GET', '/api/accounts/me/history'],

  ['GET', '/api/learning/topics'],
  ['GET', '/api/learning/topics/1/quizzes'],
  ['POST', '/api/learning/shortforms/1/complete'],

  ['GET', '/api/portfolios'],
  ['GET', '/api/portfolios/active'],
  ['POST', '/api/portfolios'],
  ['POST', '/api/portfolios/1/votes'],

  ['GET', '/api/ranking/individual'],
  ['GET', '/api/ranking/teams'],
  ['GET', '/api/ranking/schools'],
  ['GET', '/api/ranking/me'],
  ['GET', '/api/ranking/season'],

  ['GET', '/api/stocks/watchlist'],
  ['POST', '/api/stocks/watchlist'],
  ['DELETE', '/api/stocks/watchlist/AAPL'],

  ['POST', '/api/teams'],
  ['POST', '/api/teams/join'],
  ['GET', '/api/teams'],
  ['GET', '/api/teams/me'],
  ['GET', '/api/teams/me/account'],
  ['GET', '/api/teams/me/account/history'],

  ['GET', '/api/trading/orders'],
  ['POST', '/api/trading/orders'],
  ['DELETE', '/api/trading/orders/1'],
  ['GET', '/api/trading/team/queue'],
  ['POST', '/api/trading/team/orders'],
  ['GET', '/api/trading/team/orders'],

  ['GET', '/api/users/me'],
  ['PATCH', '/api/users/me'],
  ['DELETE', '/api/users/me'],
  ['POST', '/api/users/attendance/check-in'],
  ['GET', '/api/users/attendance/streak'],
  ['GET', '/api/users/attendance'],

  ['POST', '/api/community/posts'],
  ['GET', '/api/community/posts/my'],
  ['GET', '/api/community/posts/bookmarked'],
  ['PATCH', '/api/community/posts/1'],
  ['DELETE', '/api/community/posts/1'],
  ['POST', '/api/community/posts/1/comments'],
  ['PATCH', '/api/community/comments/1'],
  ['DELETE', '/api/community/comments/1'],
  ['POST', '/api/community/posts/1/like'],
  ['POST', '/api/community/posts/1/bookmark'],
  ['POST', '/api/community/users/1/follow'],
  ['GET', '/api/community/notifications'],
  ['PATCH', '/api/community/notifications/read-all'],

  ['POST', '/api/schools/sync'],
];

const call = (method, path, { token, body } = {}) =>
  fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
  });

for (const [method, path] of PROTECTED) {
  test(`${method} ${path} — 토큰 없으면 401`, async () => {
    const res = await call(method, path);
    assert.strictEqual(res.status, 401, `${method} ${path}에 authenticate가 빠졌다`);
  });
}

// 헬스체크는 인증 없이 열려 있어야 한다 (모니터링·배포 검증이 여기에 의존).
test('GET /api/health — 인증 없이 열려 있다', async () => {
  const res = await call('GET', '/api/health');
  assert.strictEqual(res.status, 200);
});

test('POST /api/auth/firebase-token — ID 토큰이 없으면 400으로 거부한다', async () => {
  const res = await call('POST', '/api/auth/firebase-token', { body: {} });
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).code, 'FIREBASE_TOKEN_REQUIRED');
});

test('Authorization 헤더가 Bearer 형식이 아니면 401', async () => {
  const res = await fetch(`${base}/api/accounts/me`, { headers: { Authorization: 'abc123' } });
  assert.strictEqual(res.status, 401);
});

test('변조된 토큰은 TOKEN_INVALID로 거부된다', async () => {
  const res = await call('GET', '/api/accounts/me', { token: 'eyJhbGciOiJIUzI1NiJ9.aaa.bbb' });
  assert.strictEqual(res.status, 401);
  assert.strictEqual((await res.json()).code, 'TOKEN_INVALID');
});

// 프론트는 이 코드를 보고 자동으로 refresh를 태운다 — 코드 문자열이 계약이라 바뀌면 안 된다.
test('만료된 토큰은 TOKEN_EXPIRED로 거부된다', async () => {
  const expired = jwt.sign({ userId: 1 }, process.env.JWT_ACCESS_SECRET, { expiresIn: '-1s' });
  const res = await call('GET', '/api/accounts/me', { token: expired });
  assert.strictEqual(res.status, 401);
  assert.strictEqual((await res.json()).code, 'TOKEN_EXPIRED');
});

// 역할 게이트: JWT payload의 role을 그대로 신뢰하므로 DB 없이 검증된다(school.controller.js:7).
// 통과 경로(ADMIN)는 커리어넷 외부 API를 호출하므로 여기서 다루지 않는다.
test('POST /api/schools/sync — ADMIN이 아니면 403', async () => {
  const token = jwt.sign({ userId: 1, role: 'USER' }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
  const res = await call('POST', '/api/schools/sync', { token, body: {} });
  assert.strictEqual(res.status, 403);
});

// 과거에 인증 없이 전 유저 email을 노출하던 스텁 라우트. 쓰는 곳이 없어 authenticate를 붙이는
// 대신 라우트·컨트롤러·서비스·findAll을 통째로 삭제했다. 누가 다시 만들면 여기서 걸린다.
test('GET /api/users — 존재하지 않아야 한다 (유저 목록 스텁 삭제됨)', async () => {
  const res = await call('GET', '/api/users');
  assert.strictEqual(res.status, 404);
});
