// 태그 레지스트리(core/held/view) 상태 기계 검증.
// GRACE_MS는 모듈 로드 시점에 env를 읽으므로(subscriptions.js:16) require보다 먼저 줄여야 한다.
process.env.WS_UNSUBSCRIBE_GRACE_MS = '50';

const test = require('node:test');
const assert = require('node:assert');
const subscriptions = require('../src/marketData/subscriptions');

const GRACE = subscriptions.GRACE_MS;
const flushed = () => new Promise(setImmediate); // scheduleFlush의 setImmediate 배치 대기
const afterGrace = () => new Promise((resolve) => setTimeout(resolve, GRACE + 60));

// 매 테스트마다 레지스트리를 비우고, 업스트림에 나간 지시를 기록한다.
const setup = (core = []) => {
  subscriptions.reset();
  const subbed = [];
  const unsubbed = [];
  subscriptions.init({
    core,
    onSubscribe: (symbols) => subbed.push(...symbols),
    onUnsubscribe: (symbols) => unsubbed.push(...symbols),
  });
  return { subbed, unsubbed };
};

test('init: core 심볼은 한 번의 배치로 구독된다', async () => {
  const { subbed } = setup(['AAPL', 'BTC/USD']);
  await flushed();

  assert.deepStrictEqual(subbed, ['AAPL', 'BTC/USD']);
  assert.deepStrictEqual(subscriptions.tagsOf('AAPL'), ['core']);
});

// core가 해제되면 지정가 주문이 통째로 깨진다(trading.service.js:21) — 가장 중요한 불변식.
test('core: view가 붙었다 떨어져도 해제되지 않는다', async () => {
  const { unsubbed } = setup(['AAPL']);
  await flushed();

  subscriptions.add('AAPL', 'view:socket1');
  subscriptions.remove('AAPL', 'view:socket1');
  await afterGrace();

  assert.deepStrictEqual(unsubbed, []);
  assert.ok(subscriptions.hasTag('AAPL', 'core'));
});

test('태그가 하나라도 남으면 구독을 유지한다', async () => {
  const { unsubbed } = setup();
  subscriptions.add('NVDA', 'held');
  subscriptions.add('NVDA', 'view:socket1');
  await flushed();

  subscriptions.remove('NVDA', 'held'); // 매도했지만 아직 상세페이지를 보고 있음
  await afterGrace();

  assert.deepStrictEqual(unsubbed, []);
  assert.deepStrictEqual(subscriptions.tagsOf('NVDA'), ['view:socket1']);
});

test('마지막 태그가 빠지면 유예 후에 해제된다', async () => {
  const { unsubbed } = setup();
  subscriptions.add('TSLA', 'view:socket1');
  await flushed();

  subscriptions.remove('TSLA', 'view:socket1');
  assert.deepStrictEqual(unsubbed, [], '유예 중에는 아직 해제되면 안 된다');

  await afterGrace();
  assert.deepStrictEqual(unsubbed, ['TSLA']);
  assert.strictEqual(subscriptions.hasTag('TSLA', 'view:socket1'), false);
});

// 유예(5분) > held 동기화 주기(1분) 부등식이 지키려는 것 — 상세페이지를 닫고 바로 매수했을 때
// 시세가 끊기면 안 된다.
test('유예 중 재추가되면 해제가 취소된다 (매수 직후 시세 공백 방지)', async () => {
  const { unsubbed } = setup();
  subscriptions.add('GOOGL', 'view:socket1');
  await flushed();

  subscriptions.remove('GOOGL', 'view:socket1'); // 페이지 이탈
  subscriptions.add('GOOGL', 'held'); // 유예 만료 전에 매수 체결
  await afterGrace();

  assert.deepStrictEqual(unsubbed, []);
  assert.ok(subscriptions.hasTag('GOOGL', 'held'));
});

test('setHeld: 스냅샷에서 빠진 종목만 해제하고 새 종목은 구독한다', async () => {
  const { subbed, unsubbed } = setup(['AAPL']);
  await flushed();

  subscriptions.setHeld(['AAPL', 'NVDA']); // AAPL은 core와 중복 보유
  await flushed();
  assert.ok(subbed.includes('NVDA'));

  subscriptions.setHeld(['AAPL']); // NVDA 전량 매도
  await afterGrace();

  assert.deepStrictEqual(unsubbed, ['NVDA']);
  assert.ok(subscriptions.hasTag('AAPL', 'core'), 'core는 held 스냅샷과 무관하게 유지된다');
});

test('stats: 태그 종류별로 세고 view는 소켓마다 개별 카운트한다', async () => {
  setup(['AAPL']);
  subscriptions.add('NVDA', 'held');
  subscriptions.add('NVDA', 'view:socket1');
  subscriptions.add('TSLA', 'view:socket2');
  await flushed();

  assert.deepStrictEqual(subscriptions.stats(), { total: 3, core: 1, held: 1, view: 2 });
});

test('심볼은 대문자·공백 제거로 정규화된다', async () => {
  const { unsubbed } = setup();
  subscriptions.add('  nvda  ', 'held');
  await flushed();
  assert.deepStrictEqual(subscriptions.list(), ['NVDA']);

  subscriptions.remove('nvda', 'held'); // 소문자로 지워도 같은 슬롯이어야 한다
  await afterGrace();
  assert.deepStrictEqual(unsubbed, ['NVDA']);
});
