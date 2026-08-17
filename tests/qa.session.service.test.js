const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createQaSessionService } = require('../src/domains/qa/qa.service');

const fixedNow = new Date('2026-08-17T01:00:00.000Z');

const createHarness = ({ enabled = true, pinValid = true, seedError = null, firebaseError = null } = {}) => {
  const calls = [];
  const repository = {
    createSession: async (_executor, value) => calls.push(['session', value]),
    setRootUser: async (_executor, value) => calls.push(['root', value]),
    deleteSession: async (id) => calls.push(['delete', id]),
  };
  const firebaseAdmin = {
    ensureQaUser: async (value) => {
      calls.push(['firebase-user', value]);
      if (firebaseError) throw firebaseError;
    },
    createCustomToken: async (uid, claims) => {
      calls.push(['custom-token', uid, claims]);
      return 'firebase-custom-token';
    },
    deleteQaIdentity: async (uid) => calls.push(['firebase-delete', uid]),
  };
  const seedFixtures = async (_executor, value) => {
    calls.push(['seed', value]);
    if (seedError) throw seedError;
    return { rootUserId: 41, email: 'qa-root@qa.invalid', displayName: 'QA 테스터' };
  };
  const withTransaction = async (fn) => fn({ name: 'transaction-executor' });
  const service = createQaSessionService({
    config: {
      enabled,
      pinHash: 'stored-pin-hash',
      firebaseProjectId: 'plainedu-qa',
      sessionTtlHours: 8,
      retentionHours: 24,
    },
    repository,
    firebaseAdmin,
    verifyPin: async (pin, stored) => {
      calls.push(['verify-pin', pin, stored]);
      return pinValid;
    },
    seedFixtures,
    withTransaction,
    randomUUID: () => '11111111-2222-4333-8444-555555555555',
    clock: () => fixedNow,
  });
  return { calls, service };
};

test('disabled QA authentication returns 404 before verifying the submitted PIN', async () => {
  const { calls, service } = createHarness({ enabled: false });

  await assert.rejects(
    service.createSession('secret', {}),
    (error) => error.status === 404 && error.code === 'QA_AUTH_DISABLED'
  );
  assert.deepEqual(calls, []);
});

test('invalid QA PIN returns one generic authentication error and creates no data', async () => {
  const { calls, service } = createHarness({ pinValid: false });

  await assert.rejects(
    service.createSession('wrong', {}),
    (error) => error.status === 401 && error.code === 'QA_PIN_INVALID'
  );
  assert.deepEqual(calls, [['verify-pin', 'wrong', 'stored-pin-hash']]);
});

test('valid QA PIN creates an isolated eight-hour user and Firebase custom token', async () => {
  const { calls, service } = createHarness();

  const result = await service.createSession('482913', {
    ipAddress: '127.0.0.1',
    userAgent: 'qa-test',
  });

  assert.deepEqual(result, {
    customToken: 'firebase-custom-token',
    expiresAt: '2026-08-17T09:00:00.000Z',
  });
  assert.deepEqual(calls, [
    ['verify-pin', '482913', 'stored-pin-hash'],
    ['session', {
      id: '11111111-2222-4333-8444-555555555555',
      firebaseUid: 'qa_11111111-2222-4333-8444-555555555555',
      expiresAt: new Date('2026-08-17T09:00:00.000Z'),
      ipAddress: '127.0.0.1',
      userAgent: 'qa-test',
    }],
    ['seed', {
      qaSessionId: '11111111-2222-4333-8444-555555555555',
      firebaseUid: 'qa_11111111-2222-4333-8444-555555555555',
      now: fixedNow,
    }],
    ['root', { sessionId: '11111111-2222-4333-8444-555555555555', rootUserId: 41 }],
    ['firebase-user', {
      uid: 'qa_11111111-2222-4333-8444-555555555555',
      email: 'qa-root@qa.invalid',
      displayName: 'QA 테스터',
    }],
    ['custom-token', 'qa_11111111-2222-4333-8444-555555555555', {
      qaSessionId: '11111111-2222-4333-8444-555555555555',
    }],
  ]);
});

test('fixture failure aborts before Firebase identity creation', async () => {
  const { calls, service } = createHarness({ seedError: new Error('seed failed') });

  await assert.rejects(service.createSession('482913', {}), /seed failed/);
  assert.equal(calls.some(([name]) => name === 'firebase-user'), false);
  assert.equal(calls.some(([name]) => name === 'custom-token'), false);
});

test('Firebase provisioning failure compensates the committed QA session', async () => {
  const { calls, service } = createHarness({ firebaseError: new Error('firebase failed') });

  await assert.rejects(service.createSession('482913', {}), /firebase failed/);
  assert.equal(calls.some(([name, id]) => name === 'delete' && id === '11111111-2222-4333-8444-555555555555'), true);
  assert.equal(calls.some(([name, uid]) => name === 'firebase-delete' && uid === 'qa_11111111-2222-4333-8444-555555555555'), true);
});
