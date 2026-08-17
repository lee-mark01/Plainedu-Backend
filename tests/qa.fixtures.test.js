const { test } = require('node:test');
const assert = require('node:assert/strict');

const { seedQaFixtures } = require('../src/domains/qa/fixtures');

const createExecutor = () => {
  let insertId = 100;
  const calls = [];
  const executor = {
    query: async (sql, params = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push([normalized, params]);
      if (/^SELECT/i.test(normalized)) {
        if (/FROM schools/i.test(normalized)) return [[{ id: 10 }]];
        if (/FROM Seasons/i.test(normalized)) return [[{ id: 20 }]];
        if (/FROM Topics/i.test(normalized)) return [[{ id: 30 }]];
        if (/FROM ShortForms/i.test(normalized)) return [[{ id: 31 }]];
        if (/FROM Quizzes/i.test(normalized)) return [[{ id: 32 }]];
        return [[]];
      }
      insertId += 1;
      return [{ insertId, affectedRows: 1 }];
    },
  };
  return { calls, executor };
};

test('QA fixture graph covers every supported mutable product domain in one executor', async () => {
  const { calls, executor } = createExecutor();
  const result = await seedQaFixtures(executor, {
    qaSessionId: '11111111-2222-4333-8444-555555555555',
    firebaseUid: 'qa_uid',
    now: new Date('2026-08-17T01:00:00.000Z'),
  });

  assert.equal(typeof result.rootUserId, 'number');
  assert.equal(result.email, 'qa-qa_uid@qa.invalid');
  assert.equal(result.displayName, 'QA 테스터');

  const sql = calls.map(([statement]) => statement).join('\n');
  for (const table of [
    'Users', 'Attendances', 'UserPoints', 'PointLogs',
    'UserShortformLog', 'UserQuizLog', 'UserProgress',
    'Teams', 'TeamMembers', 'Portfolios', 'TeamActivePortfolios', 'PortfolioAllocations', 'PortfolioVotes',
    'VirtualAccounts', 'AccountAssetHistories', 'AccountHoldings', 'Orders', 'OrderExecutionLogs', 'Watchlist',
    'CommunityPosts', 'CommunityComments', 'PostLikes', 'CommentLikes', 'Follows', 'Notifications', 'PostStockTags', 'PostViews', 'PostBookmarks',
    'DailyRankings',
  ]) {
    assert.match(sql, new RegExp(`(?:INSERT INTO|INSERT IGNORE INTO) ${table}\\b`, 'i'), `${table} fixture missing`);
  }
});

test('QA fixture identities and authored content are visibly synthetic and session namespaced', async () => {
  const { calls, executor } = createExecutor();
  await seedQaFixtures(executor, {
    qaSessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    firebaseUid: 'qa_second',
    now: new Date('2026-08-17T01:00:00.000Z'),
  });

  const serializedParams = JSON.stringify(calls.flatMap(([, params]) => params));
  assert.match(serializedParams, /QA/);
  assert.match(serializedParams, /qa\.invalid/);
  assert.match(serializedParams, /aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/);
});
