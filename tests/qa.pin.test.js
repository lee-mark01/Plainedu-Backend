const { test } = require('node:test');
const assert = require('node:assert/strict');

const { hashQaPin, verifyQaPin } = require('../src/domains/qa/qa.pin');

test('QA PIN verifier accepts only the PIN used to create the stored hash', async () => {
  const stored = await hashQaPin('482913', Buffer.alloc(16, 7));

  assert.equal(await verifyQaPin('482913', stored), true);
  assert.equal(await verifyQaPin('482914', stored), false);
});

test('QA PIN verifier rejects malformed stored values without throwing', async () => {
  assert.equal(await verifyQaPin('482913', ''), false);
  assert.equal(await verifyQaPin('482913', 'not-a-valid-hash'), false);
});
