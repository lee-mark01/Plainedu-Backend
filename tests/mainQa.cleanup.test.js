const test = require('node:test');
const assert = require('node:assert/strict');

const { createMainQaCleanup, QA_USER_EMAILS } = require('../db/seeds/cleanup-main-qa');

test('메인 QA 정리는 지정된 더미 사용자와 팀의 연결 데이터만 삭제한다', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push(['begin']),
    commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']),
    release: () => calls.push(['release']),
    query: async (sql, params) => {
      calls.push(['query', sql.replace(/\s+/g, ' ').trim(), params]);
      if (/SELECT id FROM Users/.test(sql)) return [[{ id: 11 }, { id: 12 }, { id: 13 }]];
      if (/SELECT DISTINCT t\.id FROM Teams/.test(sql)) return [[{ id: 21 }]];
      if (/SELECT id FROM schools/.test(sql)) return [[{ id: 31 }, { id: 32 }]];
      return [{ affectedRows: 1 }];
    },
  };
  const pool = { getConnection: async () => connection };

  const result = await createMainQaCleanup({ pool }).run();

  assert.deepEqual(result, { userIds: [11, 12, 13], teamIds: [21], schoolIds: [31, 32] });
  const queries = calls.filter(([kind]) => kind === 'query');
  assert.match(queries[3][1], /DELETE FROM DailyRankings WHERE target_type = 'TEAM'/);
  assert.deepEqual(queries[3][2], [[21]]);
  assert.match(queries[4][1], /DELETE FROM DailyRankings WHERE target_type = 'USER'/);
  assert.deepEqual(queries[4][2], [[11, 12, 13]]);
  assert.match(queries[5][1], /DELETE FROM DailyRankings WHERE target_type = 'SCHOOL'/);
  assert.deepEqual(queries[5][2], [[31, 32]]);
  assert.match(queries[6][1], /DELETE FROM Teams WHERE id IN/);
  assert.match(queries[7][1], /DELETE FROM Users WHERE email IN/);
  assert.deepEqual(queries[7][2], [QA_USER_EMAILS]);
  assert.deepEqual(calls.at(-2), ['commit']);
  assert.deepEqual(calls.at(-1), ['release']);
});

test('QA 이메일 목록에 일반 계정이 섞이면 정리를 시작하지 않는다', async () => {
  const pool = { getConnection: async () => { throw new Error('호출되면 안 됨'); } };
  assert.throws(
    () => createMainQaCleanup({ pool, qaUserEmails: ['real-user@example.com'] }),
    /QA 전용 이메일/
  );
});
