const express = require('express');
const router = express.Router();
const validate = require('../../middlewares/validate');
const authenticate = require('../../middlewares/authenticate');
const stockController = require('./stock.controller');
const chartController = require('./chart.controller');
const { searchStocksSchema, watchlistBodySchema, watchlistParamsSchema, relatedTermsSchema } = require('./stock.validator');
const relatedTermsController = require('./relatedTerms.controller');
const signalsController = require('./signals.controller');
const { symbolParamsSchema, chartQuerySchema } = require('./chart.validator');

// 종목 검색 (Stocks 테이블 — 검색바용)
router.get('/search', validate(searchStocksSchema, 'query'), stockController.searchStocks);

// 연관 검색어 (요청 19). 고정 경로라 '/:symbol'보다 앞에 있어야 한다 —
// 뒤에 두면 'related-terms'가 심볼로 매칭된다.
router.get('/related-terms', validate(relatedTermsSchema, 'query'), relatedTermsController.getRelatedTerms);

// 투자 신호 (요청 16). 고정 경로라 '/:symbol'보다 앞에 있어야 한다.
// 공개 조회다 — 신호는 사용자별로 달라지지 않고 투자 홈 첫 화면에 필요하다.
router.get('/signals', signalsController.getSignals);

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
