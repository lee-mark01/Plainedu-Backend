const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createQaConfig } = require('../src/config/qa');

const enabledEnv = {
  QA_AUTH_ENABLED: 'true',
  QA_AUTH_PIN_HASH: 'salt:key',
  QA_FIREBASE_PROJECT_ID: 'plainedu-qa',
  DB_NAME: 'plainedu_qa',
};

test('QA authentication is disabled unless explicitly enabled', () => {
  assert.deepEqual(createQaConfig({}), {
    enabled: false,
    firebaseProjectId: '',
    sessionTtlHours: 8,
    retentionHours: 24,
    pinHash: '',
  });
});

test('QA session and retention hours use valid positive environment values', () => {
  const config = createQaConfig({
    ...enabledEnv,
    QA_SESSION_TTL_HOURS: '6',
    QA_DATA_RETENTION_HOURS: '18',
  });

  assert.equal(config.enabled, true);
  assert.equal(config.sessionTtlHours, 6);
  assert.equal(config.retentionHours, 18);
});

test('QA authentication refuses the known production database', () => {
  assert.throws(
    () => createQaConfig({ ...enabledEnv, DB_NAME: 'plainedu' }),
    /production database/i
  );
});

test('QA authentication refuses the known production Firebase project', () => {
  assert.throws(
    () => createQaConfig({ ...enabledEnv, QA_FIREBASE_PROJECT_ID: 'plainedu-2c6b9' }),
    /production Firebase project/i
  );
});

test('QA authentication requires a PIN hash when enabled', () => {
  assert.throws(
    () => createQaConfig({ ...enabledEnv, QA_AUTH_PIN_HASH: '' }),
    /QA_AUTH_PIN_HASH/
  );
});
