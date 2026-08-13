// 시즌 달력 + 전환 로직.
//  1) quarterSeasonOf — 1/4/7/10월 1일 시작 ~ 분기 말일 종료, 이름 "YYYY년 N분기".
//     total_days는 참여율(ParticipationRatio)의 분모라 분기별 실제 일수와 정확히 맞아야 한다.
//  2) getOrCreateActiveSeason — 만료 판정 + 전환 경합 분기.
//     전환은 스케줄러가 아니라 "만료 후 첫 조회 요청"이 수행하므로 동시 요청이 겹칠 수 있다.
//     DB는 uq_seasons_single_active(ACTIVE 최대 1개)로 막고, 진 요청은 createSeason이 null을
//     돌려주면 findActiveSeason으로 승자의 시즌을 다시 읽어야 한다 — 그 분기를 여기서 고정한다.
//     (실제 동시성은 DB 제약이 보장하므로 여기서는 "null을 받았을 때의 처리"만 검증)
// DB/Redis 불필요. 실행: node --test tests/season.transition.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const SERVICE = path.resolve(__dirname, '../src/domains/account/account.service.js');

// 테스트별로 갈아끼우는 가짜 repository (DB 커넥션 풀을 열지 않는다)
let repo = {};
const stubs = {
  '../../config/db': {},
  './account.repository': {
    findActiveSeason: (...a) => repo.findActiveSeason(...a),
    findSeasonById: (...a) => repo.findSeasonById(...a),
    completeSeason: (...a) => repo.completeSeason(...a),
    createSeason: (...a) => repo.createSeason(...a),
  },
  '../user/user.repository': {},
  '../school/school.repository': {},
  '../../config/trading': { INITIAL_CASH_INDIVIDUAL: 100000, INITIAL_CASH_TEAM: 100000 },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === SERVICE && stubs[request]) return stubs[request];
  return origLoad.apply(this, arguments);
};
const { quarterSeasonOf, getOrCreateActiveSeason } = require(SERVICE);
Module._load = origLoad;

// 오늘 기준 만료/유효 시즌 픽스처
const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const makeSeason = (id, endOffsetDays) => ({ id, name: `시즌${id}`, end_date: daysFromNow(endOffsetDays) });

// 로컬 시간대 기준 Date (mysql2 DATE 취급과 동일 — UTC 변환 시 하루 밀리는 회귀 방어)
const at = (y, m, d) => new Date(y, m - 1, d);

test('분기 경계: 각 분기의 첫날/마지막날이 같은 시즌으로 묶인다', () => {
  const cases = [
    [at(2026, 1, 1), '2026년 1분기', '2026-01-01', '2026-03-31', 90],
    [at(2026, 3, 31), '2026년 1분기', '2026-01-01', '2026-03-31', 90],
    [at(2026, 4, 1), '2026년 2분기', '2026-04-01', '2026-06-30', 91],
    [at(2026, 6, 30), '2026년 2분기', '2026-04-01', '2026-06-30', 91],
    [at(2026, 7, 1), '2026년 3분기', '2026-07-01', '2026-09-30', 92],
    [at(2026, 9, 30), '2026년 3분기', '2026-07-01', '2026-09-30', 92],
    [at(2026, 10, 1), '2026년 4분기', '2026-10-01', '2026-12-31', 92],
    [at(2026, 12, 31), '2026년 4분기', '2026-10-01', '2026-12-31', 92],
  ];
  for (const [date, name, start, end, days] of cases) {
    assert.deepEqual(quarterSeasonOf(date), {
      name,
      start_date: start,
      end_date: end,
      total_days: days,
    });
  }
});

test('윤년 2월이 1분기 total_days에 반영된다', () => {
  assert.equal(quarterSeasonOf(at(2028, 2, 15)).total_days, 91); // 윤년: 31+29+31
  assert.equal(quarterSeasonOf(at(2027, 2, 15)).total_days, 90); // 평년: 31+28+31
});

test('연말 → 연초 전환 시 연도가 넘어간다', () => {
  assert.equal(quarterSeasonOf(at(2026, 12, 31)).name, '2026년 4분기');
  assert.equal(quarterSeasonOf(at(2027, 1, 1)).name, '2027년 1분기');
  assert.equal(quarterSeasonOf(at(2027, 1, 1)).start_date, '2027-01-01');
});

test('total_days = (end - start) + 1 (노션 리그 문서 SeasonDays 정의)', () => {
  for (const month of [1, 4, 7, 10]) {
    const s = quarterSeasonOf(at(2026, month, 1));
    const [, sm, sd] = s.start_date.split('-').map(Number);
    const [, em, ed] = s.end_date.split('-').map(Number);
    const diff = Math.round((Date.UTC(2026, em - 1, ed) - Date.UTC(2026, sm - 1, sd)) / 86400000);
    assert.equal(s.total_days, diff + 1);
  }
});

// ---------------- 전환 로직 ----------------

test('종료일이 아직 안 지났으면 전환하지 않는다', async () => {
  const current = makeSeason(1, +10);
  const calls = [];
  repo = {
    findActiveSeason: async () => current,
    findSeasonById: async () => assert.fail('조회만 해야 한다'),
    completeSeason: async () => calls.push('complete'),
    createSeason: async () => calls.push('create'),
  };
  assert.equal(await getOrCreateActiveSeason(), current);
  assert.deepEqual(calls, [], '닫기·생성이 일어나면 안 된다');
});

test('종료일 당일은 아직 유효하다 (마지막 날 조기 전환 방지)', async () => {
  const current = makeSeason(1, 0);
  repo = {
    findActiveSeason: async () => current,
    completeSeason: async () => assert.fail('마지막 날에 닫으면 안 된다'),
    createSeason: async () => assert.fail('마지막 날에 만들면 안 된다'),
    findSeasonById: async () => assert.fail(),
  };
  assert.equal(await getOrCreateActiveSeason(), current);
});

test('만료되면 이전 시즌을 닫고 새 시즌을 만들어 반환한다', async () => {
  const expired = makeSeason(1, -1);
  const created = { id: 2, name: '새 시즌' };
  const calls = [];
  repo = {
    findActiveSeason: async () => expired,
    completeSeason: async (_, id) => { calls.push(['complete', id]); return true; },
    createSeason: async (_, payload) => { calls.push(['create', payload.name]); return created.id; },
    findSeasonById: async (_, id) => (id === created.id ? created : null),
  };
  const now = new Date();
  assert.equal(await getOrCreateActiveSeason(), created);
  assert.deepEqual(calls, [['complete', 1], ['create', quarterSeasonOf(now).name]]);
});

test('전환 경합에서 지면(createSeason null) 승자의 시즌을 다시 읽는다', async () => {
  const expired = makeSeason(1, -1);
  const winner = { id: 7, name: '승자 시즌' };
  let reads = 0;
  repo = {
    // 1회차: 만료된 시즌 / 2회차(재조회): 승자가 만든 시즌
    findActiveSeason: async () => (++reads === 1 ? expired : winner),
    completeSeason: async () => false, // 다른 요청이 먼저 닫았다
    createSeason: async () => null, // uq_seasons_single_active 위반 → null
    findSeasonById: async () => assert.fail('생성 실패 시 id 조회를 하면 안 된다'),
  };
  assert.equal(await getOrCreateActiveSeason(), winner, '경합에 져도 유효한 시즌을 반환해야 한다');
  assert.equal(reads, 2);
});

test('활성 시즌이 아예 없으면 닫기 없이 현재 분기 시즌을 만든다', async () => {
  const created = { id: 1, name: '첫 시즌' };
  const calls = [];
  repo = {
    findActiveSeason: async () => null,
    completeSeason: async () => assert.fail('닫을 시즌이 없다'),
    createSeason: async (_, payload) => { calls.push(payload); return created.id; },
    findSeasonById: async () => created,
  };
  assert.equal(await getOrCreateActiveSeason(), created);
  assert.deepEqual(calls, [quarterSeasonOf(new Date())]);
});
