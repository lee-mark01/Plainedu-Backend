const pool = require('../../config/db');
const AppError = require('../../errors/AppError');
const tradingRepository = require('./trading.repository');
const accountService = require('../account/account.service');
const stockRepository = require('../stock/stock.repository');
const chartService = require('../stock/chart.service');
const { getRealtimeSymbols } = require('../../config/realtimeSymbols');
const { checkCrosses } = require('./matching.calculator');

// 지정가 주문은 틱이 실제로 들어오는 종목에서만 체결을 기대할 수 있다 (REALTIME_SYMBOLS 밖은 영원히 PENDING).
// 시장가는 REST 폴백이 있는 chartService.getQuote()로 즉시 체결하므로 이 제약이 없다.
const placeOrder = async (userId, { stock_code, order_type, price_type, order_quantity, order_price }) => {
  const account = await accountService.getOrCreateIndividualAccount(userId); // 이번 단계는 개인계좌 주문만 지원

  const stock = await stockRepository.findByCode(stock_code);
  if (!stock || stock.status !== 'ACTIVE') {
    throw new AppError('거래할 수 없는 종목입니다.', 400);
  }

  if (price_type === 'LIMIT' && !getRealtimeSymbols().includes(stock_code)) {
    throw new AppError(
      `지정가 주문은 실시간 시세가 제공되는 종목(${getRealtimeSymbols().join(', ')})에서만 가능합니다.`,
      400,
      'LIMIT_SYMBOL_NOT_SUPPORTED'
    );
  }

  const quote = await chartService.getQuote(stock_code);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const order = await tradingRepository.createOrder(conn, {
      account_id: account.id,
      trader_id: userId,
      stock_code,
      order_type,
      price_type,
      order_price: price_type === 'LIMIT' ? order_price : null,
      order_quantity,
    });

    let result;
    if (price_type === 'MARKET') {
      result = await tradingRepository.executeFill(conn, order, quote.price, order_quantity);
    } else {
      const crosses = checkCrosses({ orderType: order_type, orderPrice: order_price, currentPrice: quote.price });
      result = crosses
        ? await tradingRepository.executeFill(conn, order, order_price, order_quantity) // 크로스 시 지정가로 체결
        : { filled: false, reason: null }; // 아직 크로스 안 됨 → PENDING 유지 (거부 아님)
    }

    if (!result.filled && result.reason) {
      await conn.rollback();
      throw new AppError(
        result.reason === 'INSUFFICIENT_FUNDS' ? '보유 현금이 부족합니다.' : '보유 수량이 부족합니다.',
        400,
        result.reason
      );
    }

    await conn.commit();
    const [[updatedAccount]] = await pool.query('SELECT id, cash_balance FROM VirtualAccounts WHERE id = ?', [account.id]);
    return {
      order: { ...order, status: result.filled ? 'COMPLETED' : 'PENDING' },
      account: updatedAccount,
    };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};

const cancelOrder = async (userId, orderId) => {
  const order = await tradingRepository.findOrderById(orderId);
  if (!order) throw new AppError('주문을 찾을 수 없습니다.', 404);
  if (order.trader_id !== userId) throw new AppError('본인 주문만 취소할 수 있습니다.', 403);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // FOR UPDATE로 잠가서 취소 처리 중 틱 매칭 엔진이 먼저 체결시켜버리는 레이스를 막는다.
    const locked = await tradingRepository.lockPendingOrderById(conn, orderId);
    if (!locked) {
      await conn.rollback();
      throw new AppError('대기 중인 주문만 취소할 수 있습니다.', 409, 'ORDER_NOT_CANCELABLE');
    }

    await tradingRepository.cancelOrder(conn, orderId);
    await conn.commit();
    return { id: orderId, status: 'CANCELED' };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};

module.exports = { placeOrder, cancelOrder };
