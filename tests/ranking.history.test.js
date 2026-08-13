// 지난 시즌 화면용 조회 API 2종 (DB/Redis 없이 스텁 주입 — ranking.service.test.js와 동일 패턴)
//  1) getTeamLeaderboardBySchool — 소속 보드에서 학교를 눌렀을 때의 참여팀 목록.
//  2) getMyRankHistory — 순위 추이 그래프. scope→target_type 매핑과
//     "대상 없음"(무학교·팀 미소속)일 때 500이 아니라 빈 items로 나가는지.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const SERVICE = path.resolve(__dirname, '../src/domains/ranking/ranking.service.js');
const { getEtDateString } = require('../src/config/marketHours');

const HS = 'HIGH_SCHOOL';
const season = { id: 1, name: '2026년 2분기', start_date: '2026-04-01', end_date: '2026-06-30', total_days: 91 };

// 고교 팀 보드: team1(20.0) team2(15.0) team3(15.0) team4(10.0) team5(5.0)
//   → 리그 공동 순위 1, 2, 2, 4, 5
// 학교 배정: school1 = team1·team3·team5 / school2 = team2·team4
const BOARD_ENTRIES = [
  { member: '1', score: 20 },
  { member: '2', score: 15 },
  { member: '3', score: 15 },
  { member: '4', score: 10 },
  { member: '5', score: 5 },
];
const SCHOOL_BY_TEAM = new Map([[1, 1], [2, 2], [3, 1], [4, 2], [5, 1]]);

let historyRows = [];
let historyArgs = null;
let membership = null;
let userSchoolId = 1;

const mockCache = {
  getAllEntries: async () => BOARD_ENTRIES.map((e) => ({ ...e })),
  getUpdatedAt: async () => '2026-06-30T20:05:00.000Z',
  getCount: async () => BOARD_ENTRIES.length,
  getPage: async () => [],
  countAbove: async () => 0,
  getMembersAtScore: async () => [],
  getRank: async () => null,
};

const mockRepo = {
  findSchoolIdsByTeamIds: async (ids) => new Map(ids.map((id) => [id, SCHOOL_BY_TEAM.get(id) ?? null])),
  findSchoolIdsByUserIds: async (ids) => new Map(ids.map((id) => [id, userSchoolId])),
  findTeamProfiles: async (ids) =>
    new Map(ids.map((id) => [id, { team_name: `팀${id}`, school_name: `학교${SCHOOL_BY_TEAM.get(id)}`, r_percent: id }])),
  findPrevRanks: async () => new Map(),
  findRankHistory: async (...args) => {
    historyArgs = args;
    return historyRows;
  },
};

const stubs = {
  '../account/account.service': {
    getActiveSeason: async () => season,
    getSeasonById: async () => season,
    getOrCreateActiveSeason: async () => season,
    deriveSchoolGroup: async (schoolId) => (schoolId == null ? null : HS),
  },
  '../account/account.valuation': { valuateSeasonAccounts: async () => ({ results: [], skipped: [] }) },
  '../team/team.repository': { findMembershipByUserId: async () => membership },
  '../../config/marketHours': { getEtDateString, isEtFriday: () => false },
  '../portfolio/portfolio.repository': {
    findActiveByTeamId: async () => null,
    findAllocationsByPortfolioId: async () => [],
  },
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

// ---------------- 학교별 참여팀 순위 ----------------

test('school_id 필터: 그 학교 팀만 남기고 리그 전체 순위를 유지한다', async () => {
  const res = await service.getTeamLeaderboard(1, { page: 1, limit: 20, schoolId: 1 });

  assert.equal(res.school_id, 1);
  assert.equal(res.school_group, HS);
  assert.equal(res.pagination.total, 3, '필터 후 팀 수여야 한다 (전체 5가 아니라)');
  assert.deepEqual(
    res.rankings.map((r) => [r.team_id, r.rank]),
    [[1, 1], [3, 2], [5, 5]],
    'team3은 학교 내 2번째지만 리그에서는 공동 2위, team5는 리그 5위'
  );
  assert.equal(res.rankings[0].team_name, '팀1');
  assert.equal(res.rankings[0].team_score, 20);
});

test('school_id 필터: 동점 공동 순위(1224식)가 다른 학교에도 그대로 적용된다', async () => {
  const res = await service.getTeamLeaderboard(1, { page: 1, limit: 20, schoolId: 2 });
  assert.deepEqual(
    res.rankings.map((r) => [r.team_id, r.rank]),
    [[2, 2], [4, 4]],
    'team2는 team3과 동점이라 공동 2위, 다음 순위는 4위로 건너뜀'
  );
});

test('school_id 필터: 페이지네이션은 필터된 목록 기준', async () => {
  const p1 = await service.getTeamLeaderboard(1, { page: 1, limit: 2, schoolId: 1 });
  const p2 = await service.getTeamLeaderboard(1, { page: 2, limit: 2, schoolId: 1 });
  assert.deepEqual(p1.rankings.map((r) => r.team_id), [1, 3]);
  assert.deepEqual(p2.rankings.map((r) => r.team_id), [5]);
  assert.equal(p2.pagination.total, 3);
});

test('school_id 필터: 해당 학교 팀이 없으면 빈 목록 + total 0', async () => {
  const res = await service.getTeamLeaderboard(1, { page: 1, limit: 20, schoolId: 999 });
  assert.deepEqual(res.rankings, []);
  assert.equal(res.pagination.total, 0);
});

// ---------------- 순위 추이 ----------------

test('순위 추이: scope별로 올바른 target_type·target_id로 조회한다', async () => {
  historyRows = [
    { date: '2026-04-01', rank_position: 1800, return_rate: '0.0000', final_score: '0.0000', total: 1800 },
    { date: '2026-06-30', rank_position: 3, return_rate: '8.4200', final_score: '8.4200', total: 1284 },
  ];

  const indiv = await service.getMyRankHistory(7, { seasonId: 1, scope: 'individual' });
  assert.deepEqual(historyArgs.slice(0, 4), [1, 'USER', 7, HS]);
  assert.equal(indiv.target_id, 7);
  assert.equal(indiv.season_name, '2026년 2분기');
  assert.deepEqual(indiv.items[1], { date: '2026-06-30', rank: 3, total: 1284, score: 8.42, return_rate: 8.42 });

  await service.getMyRankHistory(7, { seasonId: 1, scope: 'school_individual' });
  assert.deepEqual(historyArgs.slice(0, 4), [1, 'SCHOOL_INDIVIDUAL', 1, HS], '소속 스코프는 학교 id로 조회');

  await service.getMyRankHistory(7, { seasonId: 1, scope: 'school_team' });
  assert.equal(historyArgs[1], 'SCHOOL_TEAM');

  membership = { team_id: 42 };
  await service.getMyRankHistory(7, { seasonId: 1, scope: 'team' });
  assert.deepEqual(historyArgs.slice(0, 4), [1, 'TEAM', 42, HS]);
  membership = null;
});

test('순위 추이: 팀 미소속이면 500이 아니라 빈 items', async () => {
  membership = null;
  const res = await service.getMyRankHistory(7, { seasonId: 1, scope: 'team' });
  assert.deepEqual(res.items, []);
  assert.equal(res.target_id, null);
  assert.equal(res.scope, 'team');
});

test('순위 추이: 학교 미설정이면 school_group null + 빈 items (리그 미참여)', async () => {
  userSchoolId = null;
  const res = await service.getMyRankHistory(7, { seasonId: 1, scope: 'individual' });
  assert.equal(res.school_group, null);
  assert.deepEqual(res.items, []);
  userSchoolId = 1;
});
