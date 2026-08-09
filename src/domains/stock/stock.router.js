const express = require('express');
const router = express.Router();
const validate = require('../../middlewares/validate');
const authenticate = require('../../middlewares/authenticate');
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

// 시세 차트 (Twelve Data time_series + Redis 캐시)
router.get(
  '/:symbol/chart',
  validate(symbolParamsSchema, 'params'),
  validate(chartQuerySchema, 'query'),
  chartController.getChart
);

// 현재가 + 등락률 (헤더 초기값 — 실시간 갱신은 Socket.IO 'price' 이벤트)
router.get('/:symbol/quote', validate(symbolParamsSchema, 'params'), chartController.getQuote);

module.exports = router;
