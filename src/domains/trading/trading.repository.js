const pool = require('../../config/db');

const round2 = (n) => Math.round(n * 100) / 100;

const createOrder = async (conn, o) => {
  const [result] = await conn.query(
    `INSERT INTO Orders (account_id, proposal_id, trader_id, stock_code, order_type, price_type, order_price, order_quantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [o.account_id, o.proposal_id || null, o.trader_id, o.stock_code, o.order_type, o.price_type, o.order_price, o.order_quantity]
  );
  return { id: result.insertId, status: 'PENDING', ...o };
};

// 즉시체결(주문 접수 시)과 틱 매칭(matching.service.js) 양쪽에서 공유하는 체결 처리.
// 현금/보유수량 부족은 UPDATE의 WHERE 조건으로 원자적으로 확인한다 (조회 후 별도 체크 시 생기는 레이스 방지).
const executeFill = async (conn, order, fillPrice, fillQuantity) => {
  const amount = round2(fillPrice * fillQuantity);

  if (order.order_type === 'BUY') {
    const [res] = await conn.query(
      'UPDATE VirtualAccounts SET cash_balance = cash_balance - ? WHERE id = ? AND cash_balance >= ?',
      [amount, order.account_id, amount]
    );
    if (res.affectedRows === 0) return { filled: false, reason: 'INSUFFICIENT_FUNDS' };

    await conn.query(
      `INSERT INTO AccountHoldings (account_id, stock_code, quantity, average_buy_price)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         average_buy_price = ((quantity * average_buy_price) + (VALUES(quantity) * VALUES(average_buy_price))) / (quantity + VALUES(quantity)),
         quantity = quantity + VALUES(quantity)`,
      [order.account_id, order.stock_code, fillQuantity, fillPrice]
    );
  } else {
    const [res] = await conn.query(
      'UPDATE AccountHoldings SET quantity = quantity - ? WHERE account_id = ? AND stock_code = ? AND quantity >= ?',
      [fillQuantity, order.account_id, order.stock_code, fillQuantity]
    );
    if (res.affectedRows === 0) return { filled: false, reason: 'INSUFFICIENT_HOLDINGS' };

    await conn.query('UPDATE VirtualAccounts SET cash_balance = cash_balance + ? WHERE id = ?', [amount, order.account_id]);
    await conn.query('DELETE FROM AccountHoldings WHERE account_id = ? AND stock_code = ? AND quantity = 0', [
      order.account_id,
      order.stock_code,
    ]);
  }

  await conn.query(
    "UPDATE Orders SET status='COMPLETED', executed_price=?, executed_quantity=?, completed_at=NOW() WHERE id=? AND status='PENDING'",
    [fillPrice, fillQuantity, order.id]
  );
  await conn.query(
    'INSERT INTO OrderExecutionLogs (order_id, executed_price, executed_quantity, trading_fee, execution_amount) VALUES (?, ?, ?, 0, ?)',
    [order.id, fillPrice, fillQuantity, amount]
  );

  return { filled: true };
};

const findPendingLimitOrdersBySymbol = async (stock_code) => {
  const [rows] = await pool.query(
    "SELECT * FROM Orders WHERE stock_code = ? AND price_type = 'LIMIT' AND status = 'PENDING'",
    [stock_code]
  );
  return rows;
};

// FOR UPDATE로 잠가서 동시에 여러 틱/요청이 같은 주문을 중복 체결하지 못하게 한다.
// 이미 처리된(PENDING이 아닌) 주문은 조회되지 않으므로 호출부에서 자연스럽게 스킵된다.
const lockPendingOrderById = async (conn, id) => {
  const [rows] = await conn.query("SELECT * FROM Orders WHERE id = ? AND status = 'PENDING' FOR UPDATE", [id]);
  return rows[0] || null;
};

const markOrderFailed = async (conn, id) => {
  await conn.query("UPDATE Orders SET status='FAILED', completed_at=NOW() WHERE id=? AND status='PENDING'", [id]);
};

const findOrderById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM Orders WHERE id = ?', [id]);
  return rows[0] || null;
};

const cancelOrder = async (conn, id) => {
  await conn.query("UPDATE Orders SET status='CANCELED', completed_at=NOW() WHERE id=? AND status='PENDING'", [id]);
};

// 개인/팀 주문 내역 조회가 공유하는 페이지네이션 쿼리 (orderHistory.controller.js, teamOrder.service.js)
const listOrdersByAccount = async (accountId, { status, page, limit }) => {
  const whereSql = status ? 'account_id = ? AND status = ?' : 'account_id = ?';
  const params = status ? [accountId, status] : [accountId];

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM Orders WHERE ${whereSql}`, params);
  const [orders] = await pool.query(
    `SELECT id, proposal_id, trader_id, stock_code, order_type, price_type, order_price, order_quantity,
            executed_price, executed_quantity, status, created_at, completed_at
     FROM Orders WHERE ${whereSql}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );

  return { orders, pagination: { page, limit, total } };
};

module.exports = {
  createOrder,
  executeFill,
  findPendingLimitOrdersBySymbol,
  lockPendingOrderById,
  markOrderFailed,
  findOrderById,
  cancelOrder,
  listOrdersByAccount,
};
