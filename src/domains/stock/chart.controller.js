const chartService = require('./chart.service');
const { isValidSymbol } = require('./symbol');
const AppError = require('../../errors/AppError');

// 심볼은 Joi 정규식만 통과하면 무엇이든 들어온다. 그대로 흘리면 매 요청이 캐시를 미스하고
// 외부 API(심볼당 1크레딧)로 나가는데, 존재하지 않는 심볼은 실패라서 캐시에 저장조차 되지 않는다
// → 임의 문자열을 순회하는 것만으로 하루치 크레딧이 마른다. 여기서 우리가 아는 심볼로 잘라낸다.
const assertKnownSymbol = async (symbol) => {
  if (!(await isValidSymbol(symbol))) {
    throw new AppError(`존재하지 않는 심볼입니다: ${symbol}`, 404);
  }
};

// GET /api/stocks/:symbol/chart?range=1D&before=
const getChart = async (req, res, next) => {
  try {
    const { symbol, range, before } = req.validated;
    await assertKnownSymbol(symbol);
    const data = await chartService.getChart(symbol, range, before);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/stocks/:symbol/quote — 헤더 초기값/새로고침용 (실시간 갱신은 Socket.IO)
const getQuote = async (req, res, next) => {
  try {
    const { symbol } = req.validated;
    await assertKnownSymbol(symbol);
    const data = await chartService.getQuote(symbol);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getChart, getQuote };
