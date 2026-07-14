// GET /api/trading/orders — 내 주문내역 조회 (스펙: docs/specs/spec-account-valuation.md §5, D5)
// 체결 파트와의 충돌을 피하기 위해 컨트롤러/Joi 스키마/조회 쿼리를 이 파일에 동거시킨다.
// (trading.repository.js·trading.validator.js 무수정 — trading.router.js에는 route 2줄만 추가)
const Joi = require('joi');
const pool = require('../../config/db');
const accountService = require('../account/account.service');

const listOrdersSchema = Joi.object({
  status: Joi.string().valid('PENDING', 'COMPLETED', 'CANCELED', 'FAILED'),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const listMyOrders = async (req, res, next) => {
  try {
    const { status, page, limit } = req.validated;
    const account = await accountService.getOrCreateIndividualAccount(req.user.userId); // 개인계좌 기준 (주문 생성과 동일 정책)

    const whereSql = status ? 'account_id = ? AND status = ?' : 'account_id = ?';
    const params = status ? [account.id, status] : [account.id];

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM Orders WHERE ${whereSql}`, params);
    const [orders] = await pool.query(
      `SELECT id, stock_code, order_type, price_type, order_price, order_quantity,
              executed_price, executed_quantity, status, created_at, completed_at
       FROM Orders WHERE ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );

    res.json({ success: true, data: { orders, pagination: { page, limit, total } } });
  } catch (err) {
    next(err);
  }
};

module.exports = { listMyOrders, listOrdersSchema };
