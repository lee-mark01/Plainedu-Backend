const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createQaRepository } = require('../src/domains/qa/qa.repository');

const recordingExecutor = () => {
  const calls = [];
  return {
    calls,
    executor: {
      query: async (sql, params) => {
        calls.push([sql.replace(/\s+/g, ' ').trim(), params]);
        return [{ insertId: 41, affectedRows: 1 }];
      },
    },
  };
};

test('QA repository creates a session and a Firebase-linked ordinary root user', async () => {
  const { calls, executor } = recordingExecutor();
  const repository = createQaRepository({ query: async () => { throw new Error('pool should not be used'); } });

  await repository.createSession(executor, {
    id: 'session-id',
    firebaseUid: 'qa_uid',
    expiresAt: new Date('2026-08-17T09:00:00.000Z'),
  });
  const fixture = await repository.createRootFixture(executor, {
    qaSessionId: 'session-id',
    firebaseUid: 'qa_uid',
  });
  await repository.setRootUser(executor, { sessionId: 'session-id', rootUserId: fixture.rootUserId });

  assert.deepEqual(fixture, {
    rootUserId: 41,
    email: 'qa-qa_uid@qa.invalid',
    displayName: 'QA 테스터',
  });
  assert.match(calls[0][0], /INSERT INTO QaSessions/);
  assert.match(calls[1][0], /INSERT INTO Users/);
  assert.deepEqual(calls[1][1], [
    'qa-qa_uid@qa.invalid',
    'QA 테스터',
    'firebase',
    'qa_uid',
    'session-id',
  ]);
  assert.match(calls[2][0], /UPDATE QaSessions SET root_user_id = \?/);
});
