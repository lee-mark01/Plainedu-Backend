// 틱 기반 지정가 주문 체결 엔진
// marketData가 새 가격을 받을 때마다(server.js가 marketData.onPriceUpdate로 연결) 호출된다.
const pool = require('../../config/db');
const tradingRepository = require('./trading.repository');
const { checkCrosses } = require('./matching.calculator');

const tryFillOrder = async (orderId, currentPrice) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // FOR UPDATE로 잠가서 동시 처리(다른 틱, 혹은 주문 접수 시점의 즉시체결)와의 중복 체결을 막는다.
    const order = await tradingRepository.lockPendingOrderById(conn, orderId);
    if (!order) {
      await conn.commit(); // 이미 다른 경로에서 처리됨 — 할 일 없음
      return;
    }

    const crosses = checkCrosses({
      orderType: order.order_type,
      orderPrice: Number(order.order_price),
      currentPrice,
    });

    if (!crosses) {
      await conn.commit(); // 가격이 다시 멀어짐 — PENDING 유지
      return;
    }

    const result = await tradingRepository.executeFill(conn, order, Number(order.order_price), Number(order.order_quantity));
    if (!result.filled) {
      // 크로스는 됐지만 그 사이 현금/보유수량을 다른 주문에 써버린 경우 — 무한 재시도하지 않고 실패 처리
      await tradingRepository.markOrderFailed(conn, order.id);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error(`[matching] 주문 #${orderId} 처리 실패:`, err.message);
  } finally {
    conn.release();
  }
};

const handlePriceUpdate = async (symbol, price) => {
  const candidates = await tradingRepository.findPendingLimitOrdersBySymbol(symbol);
  for (const order of candidates) {
    await tryFillOrder(order.id, price);
  }
};

module.exports = { handlePriceUpdate };
