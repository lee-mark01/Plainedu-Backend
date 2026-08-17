const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createQaCleanupJob } = require('../src/jobs/qaSessionCleanup');

test('cleanup claims expired sessions, removes Firebase identities, then deletes sessions', async () => {
  const calls = [];
  const repository = {
    claimExpiredSessions: async ({ limit, staleBefore }) => {
      calls.push(['claim', limit, staleBefore]);
      return [{ id: 'session-1', firebaseUid: 'qa_session-1' }];
    },
    deleteSession: async (id) => calls.push(['delete', id]),
    releaseCleanupClaim: async (id) => calls.push(['release', id]),
  };
  const firebaseAdmin = {
    deleteQaIdentity: async (uid) => calls.push(['firebase', uid]),
  };
  const now = new Date('2026-08-17T00:00:00.000Z');
  const job = createQaCleanupJob({ repository, firebaseAdmin, clock: () => now, logger: { info() {}, error() {} } });

  const result = await job.runOnce();

  assert.deepEqual(result, { claimed: 1, deleted: 1, failed: 0 });
  assert.deepEqual(calls.map((call) => call[0]), ['claim', 'firebase', 'delete']);
  assert.equal(calls[0][1], 50);
  assert.equal(calls[0][2].toISOString(), '2026-08-16T23:45:00.000Z');
});

test('cleanup releases the claim when external identity deletion fails so it can retry', async () => {
  const released = [];
  const job = createQaCleanupJob({
    repository: {
      claimExpiredSessions: async () => [{ id: 'session-2', firebaseUid: 'qa_session-2' }],
      deleteSession: async () => assert.fail('database session must remain for retry'),
      releaseCleanupClaim: async (id) => released.push(id),
    },
    firebaseAdmin: { deleteQaIdentity: async () => { throw new Error('firebase unavailable'); } },
    clock: () => new Date('2026-08-17T00:00:00.000Z'),
    logger: { info() {}, error() {} },
  });

  assert.deepEqual(await job.runOnce(), { claimed: 1, deleted: 0, failed: 1 });
  assert.deepEqual(released, ['session-2']);
});
