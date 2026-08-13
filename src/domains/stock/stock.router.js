const express = require('express');
const router = express.Router();
const validate = require('../../middlewares/validate');
const authenticate = require('../../middlewares/authenticate');
const rateLimit = require('../../middlewares/rateLimit');
const stockController = require('./stock.controller');
const chartController = require('./chart.controller');
const { searchStocksSchema, watchlistBodySchema, watchlistParamsSchema } = require('./stock.validator');
const { symbolParamsSchema, chartQuerySchema } = require('./chart.validator');

// 종목 검색 (Stocks 테이블 — 검색바용)
router.get('/search', validate(searchStocksSchema, 'query'), stockController.searchStocks);

// 관심종목 (:symbol 와일드카드 라우트보다 먼저 선언)
router.get('/watchlist', authenticate, stockController.getWatchlist);
router.post('/watchlist', authenticate, validate(watchlistBodySchema), stockController.addWatchlist);
router.delete(
  '/watchlist/:stock_code',
  authenticate,
  validate(watchlistParamsSchema, 'params'),
  stockController.removeWatchlist
);

// 시세 API는 비로그인 화면에서도 쓰므로 인증 대신 IP 기준 레이트리밋으로 막는다.
// 대부분의 요청은 Redis 캐시에서 끝나 크레딧을 쓰지 않으므로 한도는 넉넉하게 잡는다
// (대학 공용망이면 한 IP 뒤에 수십 명이 있다).
const quoteLimit = rateLimit('quote', 300, 60);

// 반면 before=(과거 구간 드래그)는 캐시를 의도적으로 우회해서 요청당 1크레딧이 확정으로 나간다
// (chart.service.js의 "구간별 조회분은 캐싱하지 않는다" 주석 참고) → 훨씬 좁게 건다.
// 사람이 차트를 끌어서 보는 속도로는 분당 30회에 닿지 않는다.
const historyLimit = rateLimit('chart-history', 30, 60);

router.get(
  '/:symbol/chart',
  validate(symbolParamsSchema, 'params'),
  validate(chartQuerySchema, 'query'),
  quoteLimit,
  (req, res, next) => (req.validated.before ? historyLimit(req, res, next) : next()),
  chartController.getChart
);

// 현재가 + 등락률 (헤더 초기값 — 실시간 갱신은 Socket.IO 'price' 이벤트)
router.get('/:symbol/quote', validate(symbolParamsSchema, 'params'), quoteLimit, chartController.getQuote);

module.exports = router;
