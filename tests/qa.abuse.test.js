const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createQaAbuseGuard } = require('../src/domains/qa/qa.abuse');
const { createQaController } = require('../src/domains/qa/qa.controller');

const createStore = () => {
  const values = new Map();
  return {
    values,
    reserve: async (keys, { perIpLimit, globalLimit }) => {
      if ((values.get(keys[0]) || 0) >= perIpLimit || (values.get(keys[1]) || 0) >= globalLimit) return 0;
      keys.forEach((key) => values.set(key, (values.get(key) || 0) + 1));
      return 1;
    },
    release: async (keys) => keys.forEach((key) => values.set(key, Math.max(0, (values.get(key) || 0) - 1))),
  };
};

test('QA PIN guard retains failed reservations and releases successful ones', async () => {
  const store = createStore();
  const guard = createQaAbuseGuard({ store, clock: () => 0, perIpLimit: 2, globalLimit: 10 });
  const successful = await guard.reserve('1.1.1.1');
  await guard.release(successful);
  await guard.reserve('1.1.1.1');
  await guard.reserve('1.1.1.1');
  await assert.rejects(guard.reserve('1.1.1.1'), (error) => error.status === 429);
});

test('QA PIN guard atomically caps concurrent verification and fails closed without Redis', async () => {
  const store = createStore();
  const guard = createQaAbuseGuard({ store, clock: () => 0, perIpLimit: 5, globalLimit: 2 });
  const attempts = await Promise.allSettled([
    guard.reserve('1.1.1.1'), guard.reserve('2.2.2.2'), guard.reserve('3.3.3.3'), guard.reserve('4.4.4.4'),
  ]);
  assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 2);
  const unavailable = createQaAbuseGuard({ store: { reserve: async () => { throw new Error('down'); } } });
  await assert.rejects(unavailable.reserve('1.1.1.1'), (error) => error.status === 503);
});

test('concurrent controller requests never begin PIN verification beyond the reserved threshold', async () => {
  const guard = createQaAbuseGuard({ store: createStore(), clock: () => 0, perIpLimit: 2, globalLimit: 2 });
  let verifications = 0;
  const controller = createQaController({
    getConfig: () => ({}),
    getAbuse: () => guard,
    getService: () => ({
      createSession: async () => {
        verifications += 1;
        const error = new Error('wrong');
        error.code = 'QA_PIN_INVALID';
        throw error;
      },
    }),
  });
  const invoke = (ip) => new Promise((resolve) => controller.createSession(
    { ip, validated: { pin: 'wrong' }, headers: {} },
    { status: () => ({ json: resolve }) },
    resolve
  ));
  await Promise.all([invoke('1'), invoke('2'), invoke('3'), invoke('4')]);
  assert.equal(verifications, 2);
});
