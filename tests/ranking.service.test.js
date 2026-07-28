// ranking.service 통합 로직 테스트 — 일일 스냅샷·rank_change·동점 재정렬
// DB/Redis 대신 Module._load 스텁으로 repository/cache를 주입한다 (calculator·marketHours는 실물).
// 특히 "완전 동점(점수·참여율·출석) 그룹의 스냅샷↔API 순위 역전" 회귀를 재현·방어한다:
//   스냅샷 입력(zrevrange)은 동점 멤버가 사전순 역순, API 입력(zrangebyscore)은 정순 —
//   attachParticipation의 4차 user_id tiebreak가 없으면 두 경로의 순위가 뒤집힌다 (2026-07-28 리뷰).
// 실행: node --test tests/ranking.service.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const SERVICE = path.resolve(__dirname, '../src/domains/ranking/ranking.service.js');
const { getEtDateString } = require('../src/config/marketHours');

const TODAY = getEtDateString();

// ---- 시나리오 ----
// 개인: user10(+5.0, 출석2) / user11(+5.0, 출석8) — 동점, 참여율로 11이 1위
//       user12·user13(−2.0, 출석0) — 완전 동점 → user_id 4차 tiebreak
// 팀:   team20(R%10 → TeamScore 19.0) / team21·team22(R%0 → 10.0 동점 → 공동 2위)
// 학교: 전원 school_id null → 학교 보드 비어있음
const season = { id: 1, start_date: '2026-07-01', end_date: '2026-09-28', total_days: 90 };

const valuationResult = {
  valuated_at: '2026-07-28T20:05:00.000Z',
  results: [
    { account_id: 100, account_type: 'INDIVIDUAL', user_id: 10, team_id: null, return_rate: 5.0, total_equity: 105000 },
    { account_id: 101, account_type: 'INDIVIDUAL', user_id: 11, team_id: null, return_rate: 5.0, total_equity: 105000 },
    { account_id: 102, account_type: 'INDIVIDUAL', user_id: 12, team_id: null, return_rate: -2.0, total_equity: 98000 },
    { account_id: 103, account_type: 'INDIVIDUAL', user_id: 13, team_id: null, return_rate: -2.0, total_equity: 98000 },
    { account_id: 200, account_type: 'TEAM', user_id: null, team_id: 20, return_rate: 10.0, total_equity: 110000 },
    { account_id: 201, account_type: 'TEAM', user_id: null, team_id: 21, return_rate: 0.0, total_equity: 100000 },
    { account_id: 202, account_type: 'TEAM', user_id: null, team_id: 22, return_rate: 0.0, total_equity: 100000 },
  ],
  skipped: [],
};

const activeDays = new Map([[10, 2], [11, 8], [12, 0], [13, 0]]);
const teamProfiles = new Map([
  [20, { team_name: 'A', school_name: null, r_percent: 10.0 }],
  [21, { team_name: 'B', school_name: null, r_percent: 0.0 }],
  [22, { team_name: 'C', school_name: null, r_percent: 0.0 }],
]);

// ---- 목: Redis 동점 순서 의미까지 재현 ----
const boards = new Map();
const captured = { dailyRows: null, assetRows: null, prevRanksCalls: [] };
let prevRanksData = new Map();

const byZrevrange = (list) =>
  [...list].sort((a, b) => b.score - a.score || (a.member < b.member ? 1 : -1)); // 동점: 사전순 역순

const mockCache = {
  syncBoard: async (_s, board, entries) => {
    boards.set(board, entries.map((e) => ({ member: String(e.member), score: e.score })));
    return { written: entries.length, removed: 0 };
  },
  getAllEntries: async (_s, board) => byZrevrange(boards.get(board) || []),
  getCount: async (_s, board) => (boards.get(board) || []).length,
  getPage: async (_s, board, offset, limit) =>
    byZrevrange(boards.get(board) || []).slice(offset, offset + limit).map((e, i) => ({ ...e, rank: offset + i + 1 })),
  getUpdatedAt: async () => valuationResult.valuated_at,
  countAbove: async (_s, board, score) => (boards.get(board) || []).filter((e) => e.score > score).length,
  // zrangebyscore: 동점 멤버 사전순 정순 — getAllEntries와 반대 (역전 회귀 재현의 핵심)
  getMembersAtScore: async (_s, board, score) =>
    (boards.get(board) || []).filter((e) => e.score === score).map((e) => e.member).sort(),
  getRank: async (_s, board, member) => {
    const list = byZrevrange(boards.get(board) || []);
    const idx = list.findIndex((e) => e.member === String(member));
    return idx === -1 ? null : { rank: idx + 1, score: list[idx].score };
  },
};

const mockRepo = {
  findActiveDaysByUserIds: async (ids) => new Map(ids.map((id) => [id, activeDays.get(id) ?? 0])),
  findUserProfiles: async (ids) => new Map(ids.map((id) => [id, { nickname: `u${id}`, school_name: null }])),
  findTeamProfiles: async (ids) => new Map(ids.map((id) => [id, teamProfiles.get(id)])),
  findSchoolIdsByUserIds: async (ids) => new Map(ids.map((id) => [id, null])),
  findSchoolIdsByTeamIds: async (ids) => new Map(ids.map((id) => [id, null])),
  findSchoolProfiles: async () => new Map(),
  upsertDailyRankings: async (rows) => { captured.dailyRows = rows; return rows.length; },
  findPrevRanks: async (seasonId, targetType, targetIds, beforeDate) => {
    captured.prevRanksCalls.push({ targetType, beforeDate });
    return prevRanksData;
  },
};

const stubs = {
  '../account/account.service': {
    getActiveSeason: async () => season,
    getSeasonById: async () => season,
    getOrCreateActiveSeason: async () => season,
    recordDailyAssetHistories: async (rows) => { captured.assetRows = rows; return rows.length; },
  },
  '../account/account.valuation': { valuateSeasonAccounts: async () => valuationResult },
  '../team/team.repository': { findMembershipByUserId: async () => null },
  './ranking.cache': mockCache,
  './ranking.repository': mockRepo,
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === SERVICE && stubs[request]) return stubs[request];
  return origLoad.call(this, request, parent, isMain);
};
const service = require(SERVICE);
Module._load = origLoad;

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// 스냅샷은 1회만 돌리고 결과를 여러 test가 검증
const snapshotResult = service.snapshotDailyRankings();

test('스냅샷: rank_date=오늘 ET, USER 4 + TEAM 3 = 7행, 자산 7행', async () => {
  const result = await snapshotResult;
  assert.equal(result.rank_date, TODAY);
  assert.equal(result.rankings_written, 7);
  assert.equal(result.assets_written, 7);
});

test('스냅샷 USER: 동점은 참여율 재정렬 — user11(출석8) 1위, user10(출석2) 2위', async () => {
  await snapshotResult;
  const byId = new Map(captured.dailyRows.filter((r) => r.target_type === 'USER').map((r) => [r.target_id, r]));
  assert.equal(byId.get(11).rank_position, 1);
  assert.equal(byId.get(10).rank_position, 2);
});

test('완전 동점 회귀: zrevrange 역순 입력에도 user_id 4차 tiebreak로 12→3위, 13→4위', async () => {
  await snapshotResult;
  const byId = new Map(captured.dailyRows.filter((r) => r.target_type === 'USER').map((r) => [r.target_id, r]));
  assert.equal(byId.get(12).rank_position, 3);
  assert.equal(byId.get(13).rank_position, 4);
});

test('스냅샷 USER: participation_rate = 실값 %(2자리) — 8/90→8.89, 2/90→2.22', async () => {
  await snapshotResult;
  const byId = new Map(captured.dailyRows.filter((r) => r.target_type === 'USER').map((r) => [r.target_id, r]));
  assert.ok(near(byId.get(11).participation_rate, 8.89));
  assert.ok(near(byId.get(10).participation_rate, 2.22));
});

test('스냅샷 TEAM: 공동순위 1224식 — 19.0=1위, 10.0 동점 둘 다 2위 / final=TeamScore, return=R%', async () => {
  await snapshotResult;
  const byId = new Map(captured.dailyRows.filter((r) => r.target_type === 'TEAM').map((r) => [r.target_id, r]));
  assert.equal(byId.get(20).rank_position, 1);
  assert.equal(byId.get(21).rank_position, 2);
  assert.equal(byId.get(22).rank_position, 2);
  assert.ok(near(byId.get(20).final_score, 19.0));
  assert.ok(near(byId.get(20).return_rate, 10.0));
});

test('스텁 영구기록 금지: 전 행 alignment_score=null, 팀 participation_rate=null', async () => {
  await snapshotResult;
  captured.dailyRows.forEach((r) => assert.equal(r.alignment_score, null));
  captured.dailyRows.filter((r) => r.target_type === 'TEAM').forEach((r) => assert.equal(r.participation_rate, null));
});

test('AAH: 전 계좌 기록, recorded_at=오늘 ET, 원본 equity 일치', async () => {
  await snapshotResult;
  assert.equal(captured.assetRows.length, 7);
  captured.assetRows.forEach((r) => assert.equal(r.recorded_at, TODAY));
  assert.equal(captured.assetRows.find((r) => r.account_id === 100).total_equity, 105000);
});

test('리더보드 rank_change: 상승 +, 기록없음 null, 변동없음 0 — 스냅샷↔리더보드 완전 동점 순위 일치', async () => {
  await snapshotResult;
  prevRanksData = new Map([[11, 3], [12, 3]]);
  const board = await service.getIndividualLeaderboard({ page: 1, limit: 20 });
  const byId = new Map(board.rankings.map((r) => [r.user_id, r]));
  assert.equal(byId.get(11).rank, 1);
  assert.equal(byId.get(11).rank_change, 2); // 3→1
  assert.equal(byId.get(10).rank_change, null); // 기록 없음
  assert.equal(byId.get(12).rank_change, 0); // 3→3
  assert.equal(byId.get(12).rank, 3); // 스냅샷과 동일 (역전 회귀 방지)
  assert.equal(byId.get(13).rank, 4);
});

test('팀 리더보드 rank_change — 공동순위 기준 ± 계산', async () => {
  await snapshotResult;
  prevRanksData = new Map([[20, 2], [21, 1]]);
  const board = await service.getTeamLeaderboard({ page: 1, limit: 20 });
  const byId = new Map(board.rankings.map((r) => [r.team_id, r]));
  assert.equal(byId.get(20).rank_change, 1); // 2→1
  assert.equal(byId.get(21).rank_change, -1); // 1→2
  assert.equal(byId.get(22).rank_change, null);
});

test('/me individual.rank_change — 리더보드와 같은 rank, 전일 3위→1위 = +2', async () => {
  await snapshotResult;
  prevRanksData = new Map([[11, 3]]);
  const my = await service.getMyRankingSummary(11);
  assert.equal(my.individual.rank, 1);
  assert.equal(my.individual.rank_change, 2);
});

test('/me individual.rank_change — 과거 스냅샷 없으면 null', async () => {
  await snapshotResult;
  prevRanksData = new Map();
  const my = await service.getMyRankingSummary(10);
  assert.equal(my.individual.rank_change, null);
});

test('findPrevRanks 호출 규약 — beforeDate는 항상 오늘 ET', async () => {
  await snapshotResult;
  assert.ok(captured.prevRanksCalls.length > 0);
  captured.prevRanksCalls.forEach((c) => assert.equal(c.beforeDate, TODAY));
});
