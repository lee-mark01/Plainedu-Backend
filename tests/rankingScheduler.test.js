// rankingScheduler 가드 로직 테스트 — 크론 발화 없이 tick/snapshotTick 콜백을 직접 실행
// DB/Redis 불필요 (의존성 전부 스텁). 실행: node --test tests/rankingScheduler.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const SCHED = path.resolve(__dirname, '../src/jobs/rankingScheduler.js');

const state = {
  marketOpen: true,
  season: { id: 1 },
  recompute: async () => ({ individual: { written: 3, skipped: 0 }, team: { written: 1, skipped: 0 } }),
};

const capturedByExpr = new Map();
const stubs = {
  'node-cron': { schedule: (expr, fn, opts) => { capturedByExpr.set(expr, { fn, opts }); return { stop() {} }; } },
  '../config/marketHours': { isMarketOpen: () => state.marketOpen },
  '../domains/account/account.service': { getActiveSeason: async () => state.season },
  '../domains/ranking/ranking.service': {
    recomputeRankings: (id) => state.recompute(id),
    snapshotDailyRankings: async () => ({ rank_date: '2026-07-28', rankings_written: 6, assets_written: 6 }),
  },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === SCHED && stubs[request]) return stubs[request];
  return origLoad.call(this, request, parent, isMain);
};
const scheduler = require(SCHED);
Module._load = origLoad;

scheduler.start();
const tick = capturedByExpr.get('* * * * *').fn;
const snapshot = capturedByExpr.get('5 16 * * 1-5');

// console 캡처 헬퍼
const withCapturedLogs = async (fn) => {
  const logs = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...a) => logs.push(`LOG ${a.join(' ')}`);
  console.warn = (...a) => logs.push(`WARN ${a.join(' ')}`);
  console.error = (...a) => logs.push(`ERR ${a.join(' ')}`);
  try {
    await fn();
  } finally {
    Object.assign(console, orig);
  }
  return logs;
};

test('정상 경로: 장중 + 활성 시즌 → recompute 실행·요약 로그', async () => {
  const logs = await withCapturedLogs(() => tick());
  assert.ok(logs.some((l) => /\[rankingScheduler\] 4 accounts \(skipped 0\) in \d+ms/.test(l)));
});

test('장외: 조용히 skip (무로그·recompute 미호출)', async () => {
  state.marketOpen = false;
  let called = false;
  state.recompute = async () => { called = true; return { individual: { written: 0, skipped: 0 }, team: { written: 0, skipped: 0 } }; };
  const logs = await withCapturedLogs(() => tick());
  state.marketOpen = true;
  state.recompute = async () => ({ individual: { written: 3, skipped: 0 }, team: { written: 1, skipped: 0 } });
  assert.equal(logs.length, 0);
  assert.equal(called, false);
});

test('활성 시즌 없음: 경고 정확히 1회 (매분 도배 방지) + recompute 미호출', async () => {
  state.season = null;
  const logs = await withCapturedLogs(async () => { await tick(); await tick(); });
  state.season = { id: 1 };
  const warns = logs.filter((l) => l.startsWith('WARN') && /활성 시즌 없음/.test(l));
  assert.equal(warns.length, 1);
});

test('recompute 에러: rethrow 없이 에러 로그 (프로세스 생존)', async () => {
  state.recompute = async () => { throw new Error('boom'); };
  const logs = await withCapturedLogs(() => tick()); // throw되면 테스트 자체가 실패
  state.recompute = async () => ({ individual: { written: 3, skipped: 0 }, team: { written: 1, skipped: 0 } });
  assert.ok(logs.some((l) => l.startsWith('ERR') && /boom/.test(l)));
});

test('in-flight 가드: 직전 틱 미완료 시 다음 틱 skip + 경고', async () => {
  let release;
  state.recompute = () => new Promise((resolve) => {
    release = () => resolve({ individual: { written: 2, skipped: 1 }, team: { written: 0, skipped: 0 } });
  });
  const logs = await withCapturedLogs(async () => {
    const p1 = tick(); // 진행 중에 멈춤
    await tick(); // 두 번째 틱 — 즉시 skip
    release();
    await p1;
  });
  state.recompute = async () => ({ individual: { written: 3, skipped: 0 }, team: { written: 1, skipped: 0 } });
  assert.ok(logs.some((l) => l.startsWith('WARN') && /진행 중.*skip/.test(l)));
});

test('스냅샷 크론 등록: 평일 16:05 + timezone America/New_York', () => {
  assert.ok(snapshot);
  assert.equal(snapshot.opts?.timezone, 'America/New_York');
});

test('스냅샷 틱: 정상 실행 로그', async () => {
  const logs = await withCapturedLogs(() => snapshot.fn());
  assert.ok(logs.some((l) => /\[dailySnapshot\] 2026-07-28 — rankings 6행, assets 6행/.test(l)));
});
