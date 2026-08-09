// trading.repository.executeFill 통합 테스트 — 실제 dev DB(.env)를 사용한다.
// 매 테스트는 커넥션 하나를 물고 트랜잭션을 시작해서 그 안에서만 INSERT/UPDATE하고,
// 검증까지 끝나면 성공/실패 여부와 무관하게 항상 rollback한다.
// MySQL 트랜잭션은 커밋 전까지 다른 커넥션에 안 보이므로, 실제 dev 데이터에는
// 어떤 흔적도 남기지 않으면서 진짜 DB 제약(FK, UNIQUE, 원자적 UPDATE)까지 검증할 수 있다.
require('dotenv').config();
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const pool = require('../src/config/db');

// pool의 keep-alive 커넥션이 살아있으면 프로세스가 안 끝나서 node --test가 멈춰있는 것처럼 보임
after(() => pool.end());
const tradingRepository = require('../src/domains/trading/trading.repository');
const accountService = require('../src/domains/account/account.service');

const TEST_USER_ID = 5; // db/seeds/seed-users.js로 생성되는 기존 더미 유저
const TEST_STOCK = 'AAPL'; // npm run seed:stocks로 이미 시드된 종목

// 트랜잭션 안에서 매번 결정적인 잔액으로 초기화(실제 잔액이 얼마든 무관하게 만듦)
const setCash = async (conn, accountId, amount) => {
  await conn.query('UPDATE VirtualAccounts SET cash_balance = ? WHERE id = ?', [amount, accountId]);
};

// 기존에 실제로 보유 중인 종목일 수도 있으니, 매 테스트 시작 시 지워서 항상 빈 상태에서 출발시킨다.
const clearHolding = async (conn, accountId, stockCode) => {
  await conn.query('DELETE FROM AccountHoldings WHERE account_id = ? AND stock_code = ?', [accountId, stockCode]);
};

// clearHolding 이후에 호출 — 이제 진짜로 없는 상태이니 안전하게 INSERT 가능
const seedHolding = async (conn, accountId, stockCode, quantity, averageBuyPrice) => {
  await conn.query(
    'INSERT INTO AccountHoldings (account_id, stock_code, quantity, average_buy_price) VALUES (?, ?, ?, ?)',
    [accountId, stockCode, quantity, averageBuyPrice]
  );
};

const withTestTransaction = async (fn) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await fn(conn);
  } finally {
    await conn.rollback().catch(() => {});
    conn.release();
  }
};

test('BUY 체결 성공: 잔액 차감 + 보유 생성 + 주문 COMPLETED + 체결로그 생성', async () => {
  const account = await accountService.getOrCreateIndividualAccount(TEST_USER_ID);

  await withTestTransaction(async (conn) => {
    await setCash(conn, account.id, 10000);
    await clearHolding(conn, account.id, TEST_STOCK);
    const order = await tradingRepository.createOrder(conn, {
      account_id: account.id,
      trader_id: TEST_USER_ID,
      stock_code: TEST_STOCK,
      order_type: 'BUY',
      price_type: 'MARKET',
      order_price: null,
      order_quantity: 5,
    });

    const result = await tradingRepository.executeFill(conn, order, 100, 5); // 100 × 5 = 500
    assert.equal(result.filled, true);

    const [[acc]] = await conn.query('SELECT cash_balance FROM VirtualAccounts WHERE id = ?', [account.id]);
    assert.equal(Number(acc.cash_balance), 9500);

    const [[holding]] = await conn.query(
      'SELECT quantity, average_buy_price FROM AccountHoldings WHERE account_id = ? AND stock_code = ?',
      [account.id, TEST_STOCK]
    );
    assert.equal(Number(holding.quantity), 5);
    assert.equal(Number(holding.average_buy_price), 100);

    const [[orderRow]] = await conn.query('SELECT status, executed_price, executed_quantity FROM Orders WHERE id = ?', [order.id]);
    assert.equal(orderRow.status, 'COMPLETED');
    assert.equal(Number(orderRow.executed_price), 100);
    assert.equal(Number(orderRow.executed_quantity), 5);

    const [logs] = await conn.query('SELECT * FROM OrderExecutionLogs WHERE order_id = ?', [order.id]);
    assert.equal(logs.length, 1);
    assert.equal(Number(logs[0].execution_amount), 500);
  });
});

test('BUY 잔액부족: INSUFFICIENT_FUNDS 반환 + 상태 전부 무변화', async () => {
  const account = await accountService.getOrCreateIndividualAccount(TEST_USER_ID);

  await withTestTransaction(async (conn) => {
    await setCash(conn, account.id, 100); // 100 × 5 = 500 필요 → 부족
    await clearHolding(conn, account.id, TEST_STOCK);

    const order = await tradingRepository.createOrder(conn, {
      account_id: account.id,
      trader_id: TEST_USER_ID,
      stock_code: TEST_STOCK,
      order_type: 'BUY',
      price_type: 'MARKET',
      order_price: null,
      order_quantity: 5,
    });

    const result = await tradingRepository.executeFill(conn, order, 100, 5);
    assert.deepEqual(result, { filled: false, reason: 'INSUFFICIENT_FUNDS' });

    const [[acc]] = await conn.query('SELECT cash_balance FROM VirtualAccounts WHERE id = ?', [account.id]);
    assert.equal(Number(acc.cash_balance), 100); // 그대로

    const [holdings] = await conn.query('SELECT * FROM AccountHoldings WHERE account_id = ? AND stock_code = ?', [
      account.id,
      TEST_STOCK,
    ]);
    assert.equal(holdings.length, 0); // 생성 안 됨

    const [[orderRow]] = await conn.query('SELECT status FROM Orders WHERE id = ?', [order.id]);
    assert.equal(orderRow.status, 'PENDING'); // 그대로

    const [logs] = await conn.query('SELECT * FROM OrderExecutionLogs WHERE order_id = ?', [order.id]);
    assert.equal(logs.length, 0);
  });
});

test('같은 종목 2차 BUY: 가중평균 단가 재계산', async () => {
  const account = await accountService.getOrCreateIndividualAccount(TEST_USER_ID);

  await withTestTransaction(async (conn) => {
    await setCash(conn, account.id, 100000);
    await clearHolding(conn, account.id, TEST_STOCK);

    // 1차: 10주 @ 100
    const order1 = await tradingRepository.createOrder(conn, {
      account_id: account.id,
      trader_id: TEST_USER_ID,
      stock_code: TEST_STOCK,
      order_type: 'BUY',
      price_type: 'MARKET',
      order_price: null,
      order_quantity: 10,
    });
    await tradingRepository.executeFill(conn, order1, 100, 10);

    // 2차: 10주 @ 200 → 평단가 (10*100 + 10*200) / 20 = 150
    const order2 = await tradingRepository.createOrder(conn, {
      account_id: account.id,
      trader_id: TEST_USER_ID,
      stock_code: TEST_STOCK,
      order_type: 'BUY',
      price_type: 'MARKET',
      order_price: null,
      order_quantity: 10,
    });
    await tradingRepository.executeFill(conn, order2, 200, 10);

    const [[holding]] = await conn.query(
      'SELECT quantity, average_buy_price FROM AccountHoldings WHERE account_id = ? AND stock_code = ?',
      [account.id, TEST_STOCK]
    );
    assert.equal(Number(holding.quantity), 20);
    assert.equal(Number(holding.average_buy_price), 150);
  });
});

test('SELL 체결 성공: 보유 수량 차감 + 잔액 증가', async () => {
  const account = await accountService.getOrCreateIndividualAccount(TEST_USER_ID);

  await withTestTransaction(async (conn) => {
    await setCash(conn, account.id, 0);
    await clearHolding(conn, account.id, TEST_STOCK);
    await seedHolding(conn, account.id, TEST_STOCK, 10, 100); // 기존 보유 10주 @ 100

    const order = await tradingRepository.createOrder(conn, {
      account_id: account.id,
      trader_id: TEST_USER_ID,
      stock_code: TEST_STOCK,
      order_type: 'SELL',
      price_type: 'MARKET',
      order_price: null,
      order_quantity: 4,
    });

    const result = await tradingRepository.executeFill(conn, order, 120, 4); // 120 × 4 = 480
    assert.equal(result.filled, true);

    const [[acc]] = await conn.query('SELECT cash_balance FROM VirtualAccounts WHERE id = ?', [account.id]);
    assert.equal(Number(acc.cash_balance), 480);

    const [[holding]] = await conn.query(
      'SELECT quantity FROM AccountHoldings WHERE account_id = ? AND stock_code = ?',
      [account.id, TEST_STOCK]
    );
    assert.equal(Number(holding.quantity), 6); // 10 - 4
  });
});

test('SELL 보유부족: INSUFFICIENT_HOLDINGS 반환 + 상태 전부 무변화', async () => {
  const account = await accountService.getOrCreateIndividualAccount(TEST_USER_ID);

  await withTestTransaction(async (conn) => {
    await setCash(conn, account.id, 0);
    await clearHolding(conn, account.id, TEST_STOCK);
    await seedHolding(conn, account.id, TEST_STOCK, 2, 100);

    const order = await tradingRepository.createOrder(conn, {
      account_id: account.id,
      trader_id: TEST_USER_ID,
      stock_code: TEST_STOCK,
      order_type: 'SELL',
      price_type: 'MARKET',
      order_price: null,
      order_quantity: 5, // 보유 2주뿐인데 5주 매도 시도
    });

    const result = await tradingRepository.executeFill(conn, order, 120, 5);
    assert.deepEqual(result, { filled: false, reason: 'INSUFFICIENT_HOLDINGS' });

    const [[holding]] = await conn.query(
      'SELECT quantity FROM AccountHoldings WHERE account_id = ? AND stock_code = ?',
      [account.id, TEST_STOCK]
    );
    assert.equal(Number(holding.quantity), 2); // 그대로

    const [[acc]] = await conn.query('SELECT cash_balance FROM VirtualAccounts WHERE id = ?', [account.id]);
    assert.equal(Number(acc.cash_balance), 0); // 그대로
  });
});
