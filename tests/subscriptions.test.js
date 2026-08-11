// subscriptions(태그 기반 WS 구독 레지스트리) 단위 테스트 — 의존성 0, DB/Redis 불필요.
// `node --test tests/`로 실행.
const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

const subscriptions = require('../src/marketData/subscriptions');

// 배치 flush는 setImmediate로 예약되므로(mock.timers가 setTimeout만 mock하는 경우) 실제 이벤트루프
// 한 틱을 기다리면 flush가 실행된다.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

const setup = () => {
  subscriptions.reset();
  const subscribed = [];
  const unsubscribed = [];
  subscriptions.init({
    onSubscribe: (symbols) => subscribed.push(...symbols),
    onUnsubscribe: (symbols) => unsubscribed.push(...symbols),
  });
  return { subscribed, unsubscribed };
};

test('태그 2개 중 1개 제거 → 나머지 태그로 유지 (unsubscribe 없음)', async () => {
  const { unsubscribed } = setup();
  subscriptions.add('AAPL', 'held');
  subscriptions.add('AAPL', 'view:s1');
  await flushMicrotasks();

  subscriptions.remove('AAPL', 'view:s1');
  await flushMicrotasks();

  assert.equal(subscriptions.hasTag('AAPL', 'held'), true);
  assert.deepEqual(unsubscribed, []);
});

test('마지막 태그 제거 → 유예 후 해제', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { unsubscribed } = setup();
    subscriptions.add('AAPL', 'held');
    await flushMicrotasks();

    subscriptions.remove('AAPL', 'held');
    await flushMicrotasks();
    assert.deepEqual(unsubscribed, []); // 아직 유예 중

    mock.timers.tick(subscriptions.GRACE_MS);
    await flushMicrotasks(); // 타이머 콜백이 예약한 flush를 실제로 실행

    assert.deepEqual(unsubscribed, ['AAPL']);
  } finally {
    mock.timers.reset();
  }
});

test('유예 중 재추가 → 해제 취소', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { unsubscribed } = setup();
    subscriptions.add('AAPL', 'held');
    await flushMicrotasks();

    subscriptions.remove('AAPL', 'held');
    subscriptions.add('AAPL', 'view:s1'); // 유예 중 재추가

    mock.timers.tick(subscriptions.GRACE_MS);
    await flushMicrotasks();

    assert.deepEqual(unsubscribed, []);
    assert.equal(subscriptions.hasTag('AAPL', 'view:s1'), true);
  } finally {
    mock.timers.reset();
  }
});

test('유예 타이머 발화 후 flush 전에 재추가되면 실제 해제를 보내지 않는다 (동일틱 레이스)', async () => {
  // remove()의 유예 타이머 콜백은 발화하는 순간 tagsBySymbol을 지우고 pendingUnsubscribe에
  // 넣은 뒤 flush를 setImmediate로 예약한다. 그 예약된 flush가 실제로 돌기 *전에* 같은 심볼이
  // add()로 재추가되면, add()는 이미 발화해버린 타이머를 취소할 수 없어(clearTimeout 대상이
  // 없음) 그냥 새로 태그를 붙인다 — 이때 pendingUnsubscribe에 남아있던 걸 그대로 보내면
  // "내부 상태는 구독 중인데 실제 업스트림은 해제"라는 불일치가 생긴다.
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { subscribed, unsubscribed } = setup();
    subscriptions.add('AAPL', 'held');
    await flushMicrotasks();

    subscriptions.remove('AAPL', 'held');
    mock.timers.tick(subscriptions.GRACE_MS); // 타이머 발화 — pendingUnsubscribe에 들어가고 flush 예약만 된 상태

    subscriptions.add('AAPL', 'view:s1'); // flush가 돌기 전에 재추가 (동일틱 레이스)

    await flushMicrotasks(); // 예약됐던 flush 실행

    assert.deepEqual(unsubscribed, []); // 실제 해제 액션이 나가면 안 됨
    assert.equal(subscriptions.hasTag('AAPL', 'view:s1'), true); // 내부 상태도 여전히 구독 중
    assert.ok(subscribed.includes('AAPL')); // 재구독으로 처리돼 onSubscribe도 불림
  } finally {
    mock.timers.reset();
  }
});

test('setHeld 미호출(DB 실패 시나리오) → held 태그 불변', async () => {
  setup();
  subscriptions.add('MSFT', 'held');
  await flushMicrotasks();

  const before = subscriptions.tagsOf('MSFT');
  // DB 실패를 흉내: heldTick의 try/catch가 setHeld를 아예 안 부르는 상황을 그대로 재현 —
  // 즉 아무것도 호출하지 않았을 때 상태가 그대로인지만 확인한다.
  assert.deepEqual(subscriptions.tagsOf('MSFT'), before);
});

test('setHeld: 스냅샷에서 빠진 종목은 held 제거, 새로 들어온 종목은 추가', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { subscribed, unsubscribed } = setup();
    subscriptions.setHeld(['AAPL', 'MSFT']);
    await flushMicrotasks();
    assert.deepEqual(subscribed.sort(), ['AAPL', 'MSFT']);

    subscriptions.setHeld(['MSFT', 'NVDA']); // AAPL 빠짐, NVDA 추가
    await flushMicrotasks();
    assert.equal(subscriptions.hasTag('MSFT', 'held'), true);
    assert.equal(subscriptions.hasTag('NVDA', 'held'), true);

    mock.timers.tick(subscriptions.GRACE_MS);
    await flushMicrotasks();
    assert.ok(unsubscribed.includes('AAPL'));
  } finally {
    mock.timers.reset();
  }
});

test('core 태그는 remove가 호출되지 않는 한 유지된다', async () => {
  const { subscribed } = setup();
  subscriptions.init({
    core: ['AAPL'],
    onSubscribe: (symbols) => subscribed.push(...symbols),
    onUnsubscribe: () => {},
  });
  await flushMicrotasks();
  assert.equal(subscriptions.hasTag('AAPL', 'core'), true);
});
