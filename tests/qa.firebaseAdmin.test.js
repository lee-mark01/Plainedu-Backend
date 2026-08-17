const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createQaFirebaseAdmin } = require('../src/domains/qa/firebaseAdmin');

test('QA Firebase provisioning creates the user and completed onboarding metadata', async () => {
  const calls = [];
  const auth = {
    getUser: async () => {
      const error = new Error('missing');
      error.code = 'auth/user-not-found';
      throw error;
    },
    createUser: async (value) => calls.push(['create-user', value]),
    createCustomToken: async (uid, claims) => {
      calls.push(['token', uid, claims]);
      return 'custom-token';
    },
  };
  const firestore = {
    collection: (name) => ({
      doc: (id) => ({
        set: async (value, options) => calls.push(['firestore', name, id, value, options]),
      }),
    }),
  };
  const firebase = createQaFirebaseAdmin({ auth, firestore });

  await firebase.ensureQaUser({
    uid: 'qa_uid',
    email: 'qa@qa.invalid',
    displayName: 'QA 테스터',
  });
  const token = await firebase.createCustomToken('qa_uid', { qaSessionId: 'session-id' });

  assert.equal(token, 'custom-token');
  assert.deepEqual(calls, [
    ['create-user', { uid: 'qa_uid', email: 'qa@qa.invalid', displayName: 'QA 테스터', emailVerified: true }],
    ['firestore', 'users', 'qa_uid', {
      termsAgreed: true,
      privacyAgreed: true,
      marketingAgreed: false,
      onboardingCompleted: true,
    }, { merge: true }],
    ['token', 'qa_uid', { qaSessionId: 'session-id' }],
  ]);
});

test('QA Firebase cleanup ignores already deleted identities', async () => {
  const auth = {
    deleteUser: async () => {
      const error = new Error('missing');
      error.code = 'auth/user-not-found';
      throw error;
    },
  };
  const firestore = {
    collection: () => ({ doc: () => ({ delete: async () => {} }) }),
  };
  const firebase = createQaFirebaseAdmin({ auth, firestore });

  await assert.doesNotReject(firebase.deleteQaIdentity('qa_missing'));
});

test('QA Firebase cleanup propagates Firestore failures so the session can retry', async () => {
  const firebase = createQaFirebaseAdmin({
    auth: { deleteUser: async () => {} },
    firestore: {
      collection: () => ({ doc: () => ({ delete: async () => { throw new Error('firestore unavailable'); } }) }),
    },
  });
  await assert.rejects(firebase.deleteQaIdentity('qa_uid'), /firestore unavailable/);
});

test('QA Firebase provisioning reuses an existing temporary user', async () => {
  let createCalls = 0;
  const auth = {
    getUser: async () => ({ uid: 'qa_existing' }),
    createUser: async () => { createCalls += 1; },
  };
  const firestore = {
    collection: () => ({ doc: () => ({ set: async () => {} }) }),
  };
  const firebase = createQaFirebaseAdmin({ auth, firestore });

  await firebase.ensureQaUser({
    uid: 'qa_existing',
    email: 'existing@qa.invalid',
    displayName: 'QA 기존',
  });

  assert.equal(createCalls, 0);
});
