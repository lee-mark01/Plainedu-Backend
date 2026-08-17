const { test } = require('node:test');
const assert = require('node:assert/strict');

const { appendQaScope } = require('../src/domains/qa/qa.scope');
const { createPostRepository } = require('../src/domains/community/post.repository');
const { createHotRepository } = require('../src/domains/community/hot.repository');

test('scope predicate exposes only production rows without a QA JWT', () => {
  const conditions = [];
  const params = [];
  appendQaScope({ conditions, params, alias: 'p' });
  assert.deepEqual(conditions, ['p.qa_session_id IS NULL']);
  assert.deepEqual(params, []);
});

test('scope predicate uses only the verified QA claim', () => {
  const conditions = [];
  const params = [];
  appendQaScope({ conditions, params, alias: 'p', qaSessionId: 'session-a' });
  assert.deepEqual(conditions, ['p.qa_session_id = ?']);
  assert.deepEqual(params, ['session-a']);
});

test('post writes and reads remain inside the caller QA session', async () => {
  const calls = [];
  const repository = createPostRepository({
    query: async (sql, params) => {
      calls.push({ sql, params });
      return sql.startsWith('INSERT') ? [{ insertId: 7 }] : [[{ id: 7 }]];
    },
  });
  await repository.save(1, 'GENERAL', null, null, 'title', 'body', 'session-a');
  await repository.findById(7, 'session-a');
  await repository.findByCursor({ limit: 10, qaSessionId: 'session-a' });

  assert.match(calls[0].sql, /qa_session_id/);
  assert.equal(calls[0].params.at(-1), 'session-a');
  assert.match(calls[1].sql, /qa_session_id = \?/);
  assert.match(calls[2].sql, /p\.qa_session_id = \?/);
  assert.equal(calls[2].params[0], 'session-a');
});

test('hot queries exclude other QA sessions and production rows', async () => {
  const calls = [];
  const repository = createHotRepository({ query: async (sql, params) => { calls.push({ sql, params }); return [[]]; } });
  await repository.findHotStocks(5, 'session-a');
  await repository.findPopularPosts(5, 'session-a');
  assert.ok(calls.every(({ sql }) => /p\.qa_session_id = \?/.test(sql)));
  assert.ok(calls.every(({ params }) => params[0] === 'session-a'));
});
