const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { findQaRankings } = require('../src/domains/ranking/ranking.repository');

test('all authenticated ranking controllers forward only the verified QA session claim', () => {
  const controller = fs.readFileSync('src/domains/ranking/ranking.controller.js', 'utf8');
  for (const method of ['getIndividualLeaderboard', 'getTeamLeaderboard', 'getSchoolLeaderboard', 'getMyRankingSummary', 'getMyRankHistory']) {
    const pattern = new RegExp(`${method}\\([\\s\\S]{0,180}qaSessionId: req\\.user\\.qaSessionId`);
    assert.match(controller, pattern);
  }
});

test('QA ranking branches use session-filtered snapshots instead of global Redis boards', () => {
  const service = fs.readFileSync('src/domains/ranking/ranking.service.js', 'utf8');
  const repository = fs.readFileSync('src/domains/ranking/ranking.repository.js', 'utf8');
  assert.match(service, /if \(qaSessionId\) return getQaIndividualLeaderboard/);
  assert.match(service, /if \(qaSessionId\) return getQaTeamLeaderboard/);
  assert.match(service, /if \(qaSessionId\) return getQaSchoolLeaderboard/);
  assert.match(service, /if \(qaSessionId\) return getQaRankingSummary/);
  assert.match(service, /participantCountResult\.total/);
  assert.match(service, /teamCountResult\.total/);
  assert.match(repository, /dr\.qa_session_id = \?/);
  assert.match(repository, /findQaRankings/);
});

test('QA snapshot repository applies the same session scope to count and rows', async () => {
  const calls = [];
  const executor = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return /COUNT\(\*\)/.test(sql)
        ? [[{ total: 2 }]]
        : [[{ target_id: 7 }, { target_id: 8 }]];
    },
  };
  const result = await findQaRankings({
    qaSessionId: 'session-a', seasonId: 1, targetType: 'USER', schoolGroup: 'HIGH_SCHOOL', page: 1, limit: 20,
  }, executor);
  assert.equal(result.total, 2);
  assert.deepEqual(result.rows.map((row) => row.target_id), [7, 8]);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ sql }) => sql.includes('dr.qa_session_id = ?')));
  assert.ok(calls.every(({ sql }) => /MAX\(latest\.rank_date\)/.test(sql)));
  for (const { params } of calls) {
    assert.deepEqual(
      params.slice(0, 8),
      ['session-a', 1, 'USER', 'HIGH_SCHOOL', 'session-a', 1, 'USER', 'HIGH_SCHOOL']
    );
  }
});
