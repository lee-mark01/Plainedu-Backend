const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createQaAbuseGuard } = require('../src/domains/qa/qa.abuse');

const createStore = () => {
  const values = new Map();
  return {
    values,
    getMany: async (keys) => keys.map((key) => values.get(key) || 0),
    incrementMany: async (keys) => keys.forEach((key) => values.set(key, (values.get(key) || 0) + 1)),
  };
};

test('QA PIN guard counts only explicitly recorded failures per IP', async () => {
  const store = createStore();
  const guard = createQaAbuseGuard({ store, clock: () => 0, perIpLimit: 2, globalLimit: 10 });
  await guard.assertAllowed('1.1.1.1');
  await guard.assertAllowed('1.1.1.1');
  await guard.recordFailure('1.1.1.1');
  await guard.recordFailure('1.1.1.1');
  await assert.rejects(guard.assertAllowed('1.1.1.1'), (error) => error.status === 429);
  await guard.assertAllowed('2.2.2.2');
});

test('QA PIN guard has a deployment-wide circuit and fails closed without Redis', async () => {
  const store = createStore();
  const guard = createQaAbuseGuard({ store, clock: () => 0, perIpLimit: 5, globalLimit: 2 });
  await guard.recordFailure('1.1.1.1');
  await guard.recordFailure('2.2.2.2');
  await assert.rejects(guard.assertAllowed('3.3.3.3'), (error) => error.status === 429);
  const unavailable = createQaAbuseGuard({ store: { getMany: async () => { throw new Error('down'); } } });
  await assert.rejects(unavailable.assertAllowed('1.1.1.1'), (error) => error.status === 503);
});
