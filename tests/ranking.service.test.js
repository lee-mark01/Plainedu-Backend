// ranking.service 통합 로직 테스트 — 일일 스냅샷·rank_change·동점 재정렬
// DB/Redis 대신 Module._load 스텁으로 repository/cache를 주입한다 (calculator·marketHours는 실물).
// 특히 "완전 동점(점수·참여율·출석) 그룹의 스냅샷↔API 순위 역전" 회귀를 재현·방어한다:
//   스냅샷 입력(zrevrange)은 동점 멤버가 사전순 역순, API 입력(zrangebyscore)은 정순 —
//   attachParticipation의 4차 user_id tiebreak가 없으면 두 경로의 순위가 뒤집힌다.
// 실행: node --test tests/ranking.service.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const SERVICE = path.resolve(__dirname, '../src/domains/ranking/ranking.service.js');
const { getEtDateString } = require('../src/config/marketHours');

const TODAY = getEtDateString();

// ---- 시나리오 ----
// 고교(HIGH_SCHOOL) 리그: user10(+5.0, 출석2) / user11(+5.0, 출석8) — 동점, 참여율로 11이 1위
//       user12·user13(−2.0, 출석0) — 완전 동점 → user_id 4차 tiebreak / school1 소속
//       team20(R%10, Active MP — 금요일 Alignment 100 → 19.0) / team21·22(MP 없음 → 0.0 공동 2위)
// 대학(UNIVERSITY) 리그: user14(+3.0, 출석5, school2) — 별도 보드에서 혼자 1위
// 리그 제외: user15(school_group NULL, +9.9 최고점이어도 어느 보드에도 없어야 함)
// 스냅샷은 금요일 플래그 ON으로 실행 — Alignment 확정 → 재계산 → 기록 경로를 관통 검증
const season = { id: 1, start_date: '2026-07-01', end_date: '2026-09-28', total_days: 90 };

const HS = 'HIGH_SCHOOL';
const UNIV = 'UNIVERSITY';

const valuationResult = {
  valuated_at: '2026-07-28T20:05:00.000Z',
  results: [
    { account_id: 100, account_type: 'INDIVIDUAL', user_id: 10, team_id: null, school_group: HS, return_rate: 5.0, total_equity: 105000 },
    { account_id: 101, account_type: 'INDIVIDUAL', user_id: 11, team_id: null, school_group: HS, return_rate: 5.0, total_equity: 105000 },
    { account_id: 102, account_type: 'INDIVIDUAL', user_id: 12, team_id: null, school_group: HS, return_rate: -2.0, total_equity: 98000 },
    { account_id: 103, account_type: 'INDIVIDUAL', user_id: 13, team_id: null, school_group: HS, return_rate: -2.0, total_equity: 98000 },
    { account_id: 104, account_type: 'INDIVIDUAL', user_id: 14, team_id: null, school_group: UNIV, return_rate: 3.0, total_equity: 103000 },
    { account_id: 105, account_type: 'INDIVIDUAL', user_id: 15, team_id: null, school_group: null, return_rate: 9.9, total_equity: 109900 },
    // 팀 행에는 금요일 Alignment 확정 재료(cash_balance·holdings)가 실린다 (buildValuation 스프레드 재현)
    { account_id: 200, account_type: 'TEAM', user_id: null, team_id: 20, school_group: HS, return_rate: 10.0, total_equity: 110000,
      cash_balance: 0, holdings: [{ stock_code: 'AAPL', quantity: 10, current_price: 11000 }] },
    { account_id: 201, account_type: 'TEAM', user_id: null, team_id: 21, school_group: HS, return_rate: 0.0, total_equity: 100000,
      cash_balance: 100000, holdings: [] },
    { account_id: 202, account_type: 'TEAM', user_id: null, team_id: 22, school_group: HS, return_rate: 0.0, total_equity: 100000,
      cash_balance: 100000, holdings: [] },
  ],
  skipped: [],
};

const activeDays = new Map([[10, 2], [11, 8], [12, 0], [13, 0], [14, 5], [15, 0]]);
// 유저 → 학교 (school1=고교, school2=대학, user15=무학교)
const schoolByUser = new Map([[10, 1], [11, 1], [12, 1], [13, 1], [14, 2], [15, null]]);
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

// 팀 ActiveDays = 팀원 출석일 평균 (team20=9일 → ratio 0.1, 나머지 0)
const teamAvgDays = new Map([[20, 9]]);
// TeamAlignments 목 저장소 — upsert가 채우고 find가 읽는다 (금요일 확정 → 재계산 반영 경로 검증)
const storedAlignments = new Map();

const mockRepo = {
  findActiveDaysByUserIds: async (ids) => new Map(ids.map((id) => [id, activeDays.get(id) ?? 0])),
  findTeamAvgActiveDays: async (ids) => new Map(ids.map((id) => [id, teamAvgDays.get(id) ?? 0])),
  findTeamAlignments: async (ids) => new Map(ids.filter((id) => storedAlignments.has(id)).map((id) => [id, storedAlignments.get(id)])),
  upsertTeamAlignments: async (rows) => { rows.forEach((r) => storedAlignments.set(r.team_id, r.alignment)); return rows.length; },
  findUserProfiles: async (ids) => new Map(ids.map((id) => [id, { nickname: `u${id}`, school_name: null }])),
  findTeamProfiles: async (ids) => new Map(ids.map((id) => [id, teamProfiles.get(id)])),
  findSchoolIdsByUserIds: async (ids) => new Map(ids.map((id) => [id, schoolByUser.get(id) ?? null])),
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
    deriveSchoolGroup: async (schoolId) => (schoolId === 1 ? HS : schoolId === 2 ? UNIV : null),
    recordDailyAssetHistories: async (rows) => { captured.assetRows = rows; return rows.length; },
  },
  '../account/account.valuation': { valuateSeasonAccounts: async () => valuationResult },
  '../team/team.repository': { findMembershipByUserId: async () => null },
  // 금요일 고정 (요일 무관 결정적 테스트) — getEtDateString은 실물 재사용
  '../../config/marketHours': { getEtDateString, isEtFriday: () => true },
  // 포트폴리오 읽기 전용 소비 목: team20만 Active MP(AAPL 100%) 보유
  '../portfolio/portfolio.repository': {
    findActiveByTeamId: async (teamId) => (teamId === 20 ? { portfolio_id: 500 } : null),
    findAllocationsByPortfolioId: async () => [{ stock_code: 'AAPL', target_percentage: 100 }],
  },
  // portfolio.alignment(순수 산식)는 실물 사용 — 목표 100% AAPL·현금 0 → Alignment 100
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

test('스냅샷: rank_date=오늘 ET — 고교(USER4+TEAM3+학교1) + 대학(USER1+학교1) = 10행, 자산 9행', async () => {
  const result = await snapshotResult;
  assert.equal(result.rank_date, TODAY);
  assert.equal(result.rankings_written, 10);
  assert.equal(result.assets_written, 9); // 자산 기록은 리그 무관 — user15(무학교)도 포함
});

test('그룹 리그 분리: user15(무학교)는 최고 수익률이어도 어느 보드에도 없음, user14는 대학 보드 1위', async () => {
  await snapshotResult;
  assert.equal(captured.dailyRows.some((r) => r.target_id === 15 && r.target_type === 'USER'), false);
  const u14 = captured.dailyRows.find((r) => r.target_id === 14 && r.target_type === 'USER');
  assert.equal(u14.school_group, UNIV);
  assert.equal(u14.rank_position, 1); // 대학 리그에서 혼자 1위 (고교 보드와 안 섞임)
  captured.dailyRows.filter((r) => [10, 11, 12, 13].includes(r.target_id) && r.target_type === 'USER')
    .forEach((r) => assert.equal(r.school_group, HS));
});

test('그룹별 학교 보드: school1(고교) 가중평균 5%, school2(대학) 3% — 서로 다른 보드에 각각 1위', async () => {
  await snapshotResult;
  const schools = captured.dailyRows.filter((r) => r.target_type === 'SCHOOL_INDIVIDUAL');
  const s1 = schools.find((r) => r.target_id === 1);
  const s2 = schools.find((r) => r.target_id === 2);
  assert.equal(s1.school_group, HS);
  assert.ok(near(s1.final_score, 5)); // (5×2/90 + 5×8/90)/(10/90) — ratio 0인 12·13은 기여 0
  assert.equal(s1.rank_position, 1);
  assert.equal(s2.school_group, UNIV);
  assert.ok(near(s2.final_score, 3));
  assert.equal(s2.rank_position, 1);
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

test('스냅샷 TEAM: 공동순위 1224식 + Alignment 반영 — team20(MP·Align 100)=19.0 1위, MP 없는 두 팀 0.0 공동 2위', async () => {
  await snapshotResult;
  const byId = new Map(captured.dailyRows.filter((r) => r.target_type === 'TEAM').map((r) => [r.target_id, r]));
  assert.equal(byId.get(20).rank_position, 1);
  assert.equal(byId.get(21).rank_position, 2);
  assert.equal(byId.get(22).rank_position, 2);
  assert.ok(near(byId.get(20).final_score, 19.0)); // 10×0.9 + 100×0.1 — 금요일 확정값이 같은 날 반영됨
  assert.ok(near(byId.get(20).return_rate, 10.0));
  assert.ok(near(byId.get(21).final_score, 0.0)); // MP 없음 → Alignment 0
});

test('금요일 Alignment 확정: MP 보유 팀만 저장(team20=100), 스냅샷 alignment_score 실값/MP 없으면 null', async () => {
  const result = await snapshotResult;
  assert.equal(result.alignments_confirmed, 1); // team20만
  assert.ok(near(storedAlignments.get(20), 100)); // AAPL 100% 목표 = 실보유 → 만점
  const byId = new Map(captured.dailyRows.filter((r) => r.target_type === 'TEAM').map((r) => [r.target_id, r]));
  assert.ok(near(byId.get(20).alignment_score, 100));
  assert.equal(byId.get(21).alignment_score, null);
  assert.equal(byId.get(22).alignment_score, null);
});

test('스냅샷 TEAM: participation_rate = 팀원 출석 평균 기반 실값 — team20: 9/90→10%, 나머지 0', async () => {
  await snapshotResult;
  const byId = new Map(captured.dailyRows.filter((r) => r.target_type === 'TEAM').map((r) => [r.target_id, r]));
  assert.ok(near(byId.get(20).participation_rate, 10));
  assert.ok(near(byId.get(21).participation_rate, 0));
});

test('스텁 영구기록 금지: USER 행 alignment_score=null, 학교 participation_rate=null', async () => {
  await snapshotResult;
  captured.dailyRows.filter((r) => r.target_type === 'USER').forEach((r) => assert.equal(r.alignment_score, null));
  captured.dailyRows.filter((r) => r.target_type.startsWith('SCHOOL')).forEach((r) => assert.equal(r.participation_rate, null));
});

test('AAH: 전 계좌 기록(리그 제외 유저 포함), recorded_at=오늘 ET, 원본 equity 일치', async () => {
  await snapshotResult;
  assert.equal(captured.assetRows.length, 9);
  captured.assetRows.forEach((r) => assert.equal(r.recorded_at, TODAY));
  assert.equal(captured.assetRows.find((r) => r.account_id === 100).total_equity, 105000);
  assert.ok(captured.assetRows.some((r) => r.account_id === 105)); // user15 자산 기록은 됨
});

test('리더보드 rank_change: 상승 +, 기록없음 null, 변동없음 0 — 스냅샷↔리더보드 완전 동점 순위 일치', async () => {
  await snapshotResult;
  prevRanksData = new Map([[11, 3], [12, 3]]);
  const board = await service.getIndividualLeaderboard(11, { page: 1, limit: 20 });
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
  const board = await service.getTeamLeaderboard(11, { page: 1, limit: 20 });
  const byId = new Map(board.rankings.map((r) => [r.team_id, r]));
  assert.equal(byId.get(20).rank_change, 1); // 2→1
  assert.equal(byId.get(21).rank_change, -1); // 1→2
  assert.equal(byId.get(22).rank_change, null);
});

test('리더보드 그룹 격리: user14는 대학 보드(자기만 1위), user15는 빈 보드 + school_group null', async () => {
  await snapshotResult;
  prevRanksData = new Map();
  const univBoard = await service.getIndividualLeaderboard(14, { page: 1, limit: 20 });
  assert.equal(univBoard.school_group, UNIV);
  assert.equal(univBoard.pagination.total, 1);
  assert.equal(univBoard.rankings[0].user_id, 14);
  assert.equal(univBoard.rankings[0].rank, 1); // 고교생 4명과 안 섞임

  const noLeague = await service.getIndividualLeaderboard(15, { page: 1, limit: 20 });
  assert.equal(noLeague.school_group, null);
  assert.equal(noLeague.rankings.length, 0);
  assert.equal(noLeague.pagination.total, 0);
});

test('/me individual.rank_change — 리더보드와 같은 rank, 전일 3위→1위 = +2 (+그룹·학교 섹션)', async () => {
  await snapshotResult;
  prevRanksData = new Map([[11, 3]]);
  const my = await service.getMyRankingSummary(11);
  assert.equal(my.school_group, HS);
  assert.equal(my.individual.rank, 1);
  assert.equal(my.individual.rank_change, 2);
  assert.equal(my.total_participants, 4); // 고교 리그 인원만
  assert.equal(my.school_individual.school_id, 1);
  assert.equal(my.school_individual.rank, 1);
});

test('/me 리그 미소속(user15): 전 섹션 null + school_group null', async () => {
  await snapshotResult;
  const my = await service.getMyRankingSummary(15);
  assert.equal(my.school_group, null);
  assert.equal(my.individual, null);
  assert.equal(my.team, null);
  assert.equal(my.school_individual, null);
  assert.equal(my.total_participants, 0);
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
