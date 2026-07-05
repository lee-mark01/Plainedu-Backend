const express = require('express');
const router = express.Router();
const validate = require('../../middlewares/validate');
const chartController = require('./chart.controller');
const { symbolParamsSchema, chartQuerySchema } = require('./chart.validator');

// 종목 검색은 GET /api/community/stocks/search 가 이미 제공 (stock.service 공유)

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
