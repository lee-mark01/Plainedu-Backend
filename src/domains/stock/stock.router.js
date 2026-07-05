const express = require('express');
const router = express.Router();
const validate = require('../../middlewares/validate');
const stockController = require('./stock.controller');
const chartController = require('./chart.controller');
const { searchStocksSchema } = require('./stock.validator');
const { symbolParamsSchema, chartQuerySchema } = require('./chart.validator');

// 종목 검색 (Stocks 테이블 — 검색바용)
router.get('/search', validate(searchStocksSchema, 'query'), stockController.searchStocks);

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
