const relatedTermsRepository = require('./relatedTerms.repository');

// 응답의 term은 화면에 그대로 띄울 문자열(종목명)이고, stock_code를 함께 주어
// 프론트가 종목 상세로 바로 보낼 수 있게 한다. 이름만 주면 다시 검색해야 한다.
//
// matched_by는 이 후보가 나온 이유다:
//   'related' — 기준 종목과 함께 등장한 종목
//   'prefix'  — 기준 종목을 못 찾아 이름·코드 앞부분으로 제안한 것
// 프론트가 "연관 종목"과 "검색어 보정"을 다르게 보여줄 수 있다.
const toTerms = (rows, matchedBy) =>
  rows.map((r) => ({
    term: r.name,
    stock_code: r.stock_code,
    score: Number(r.score),
    matched_by: matchedBy,
  }));

const getRelatedTerms = async (q, limit) => {
  const seed = await relatedTermsRepository.findSeedStock(q);

  // 검색어에 해당하는 종목 자체가 없으면 앞부분 매칭으로 대체한다.
  if (!seed) {
    const rows = await relatedTermsRepository.findByPrefix(q, limit);
    return { q, seed: null, terms: toTerms(rows, 'prefix') };
  }

  const rows = await relatedTermsRepository.findRelatedStocks(seed.stock_code, limit);

  // 동시 출현 데이터가 아직 없으면 빈 배열이다. 서비스 초기에는 정상이고,
  // 억지로 아무 종목이나 채우면 "연관"이라는 말이 무의미해진다.
  return {
    q,
    seed: { stock_code: seed.stock_code, name: seed.name },
    terms: toTerms(rows, 'related'),
  };
};

module.exports = { getRelatedTerms, toTerms };
