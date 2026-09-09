const AppError = require('../../errors/AppError');
const stockRepository = require('./stock.repository');

// 기업 정보 (요청 17).
//
// 지금 채울 수 있는 건 Stocks 테이블이 가진 것뿐이다 — 종목명·시장·통화.
// 설명·지역·업종·산업 내 순위·시가총액은 **데이터 소스가 없다.** Stocks에 컬럼이 없고
// 외부 공급사의 프로필 API도 연동돼 있지 않다(상위 플랜 필요).
//
// 그래서 없는 필드는 null로 내린다. 이건 임시 응답이 아니라 요청서가 지정한 계약이다 —
// "데이터가 없는 필드는 null로 명확히 내려주면 프론트에서 숨김 처리하겠습니다".
// 빈 문자열이나 "정보 없음" 같은 문자열을 넣으면 프론트가 그걸 실제 값으로 그린다.
//
// as_of는 외부 데이터의 기준 시각이다. 소스가 붙기 전에는 null이고, 붙으면 채운다 —
// 요청 16·18과 같은 이유로, 값만 주고 시점을 안 주면 오래된 정보를 최신처럼 보여주게 된다.
//
// 소스가 붙을 때 바뀌는 건 이 함수 내부뿐이다. 응답 필드 이름과 구조는 그대로 두었으므로
// 프론트는 화면을 다시 만들지 않아도 된다.
const toResponse = (stock) => ({
  stock_code: stock.stock_code,
  name: stock.name,
  market: stock.market,
  currency: stock.currency,

  // ── 데이터 소스 미연동 (전부 null) ──
  description: null,   // 기업 개요
  region: null,        // 본사 소재 지역
  sector: null,        // 대분류 (예: Technology)
  industry: null,      // 세분류 (예: Consumer Electronics)
  industry_rank: null, // 산업 내 순위
  market_cap: null,    // 시가총액

  // 외부 데이터 기준 시각. 소스 연동 전에는 null.
  as_of: null,
});

const getCompanyInfo = async (symbol) => {
  const stock = await stockRepository.findByCode(symbol);
  // 없는 종목에 빈 껍데기를 돌려주면 프론트가 오타를 정상 종목으로 취급한다.
  if (!stock) {
    throw new AppError(`존재하지 않는 종목입니다: ${symbol}`, 404, 'STOCK_NOT_FOUND');
  }
  return toResponse(stock);
};

module.exports = { getCompanyInfo, toResponse };
