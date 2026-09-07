const pool = require('../../config/db');

// 검색어와 연관된 종목 추천.
//
// 검색 로그 테이블이 없어서 "이 검색어를 쓴 사람이 다음에 본 것" 방식은 쓸 수 없고,
// Stocks에 업종·섹터가 없어서 "같은 업종"도 쓸 수 없다. 지금 가진 연관 신호는
// **동시 출현** 둘뿐이다:
//   - 같은 글에 함께 태그된 종목 (PostStockTags)
//   - 같은 사람이 함께 담은 종목 (Watchlist)
//
// 두 신호를 합산하되 글 태그에 가중치를 더 준다(x2). 관심종목은 담아만 두고 잊는 경우가
// 많지만, 한 글에 두 종목을 함께 적었다면 글쓴이가 둘을 실제로 엮어 생각한 것이다.
const TAG_WEIGHT = 2;
const WATCHLIST_WEIGHT = 1;

// 검색어로 기준 종목을 찾는다. 코드 정확 일치를 이름 부분 일치보다 앞에 둔다 —
// "T"를 쳤을 때 이름에 T가 든 수십 종목보다 종목코드 T가 먼저 나와야 한다.
const findSeedStock = async (q) => {
  const [rows] = await pool.query(
    `SELECT stock_code, name FROM Stocks
     WHERE status = 'ACTIVE' AND (stock_code = ? OR name LIKE ? OR stock_code LIKE ?)
     ORDER BY (stock_code = ?) DESC, CHAR_LENGTH(name) ASC
     LIMIT 1`,
    [q, `%${q}%`, `${q}%`, q]
  );
  return rows[0] || null;
};

// 기준 종목과 함께 등장한 종목을 빈도순으로. 기준 종목 자신은 제외한다.
const findRelatedStocks = async (seedCode, limit) => {
  const [rows] = await pool.query(
    `SELECT s.stock_code, s.name, SUM(hit.weight) AS score
     FROM (
       -- 같은 글에 함께 태그된 종목
       SELECT other.stock_code, ${TAG_WEIGHT} AS weight
       FROM PostStockTags seed
       JOIN PostStockTags other ON other.post_id = seed.post_id AND other.stock_code <> seed.stock_code
       WHERE seed.stock_code = ?

       UNION ALL

       -- 같은 사람의 관심목록에 함께 담긴 종목
       SELECT other.stock_code, ${WATCHLIST_WEIGHT} AS weight
       FROM Watchlist seed
       JOIN Watchlist other ON other.user_id = seed.user_id AND other.stock_code <> seed.stock_code
       WHERE seed.stock_code = ?
     ) hit
     JOIN Stocks s ON s.stock_code = hit.stock_code AND s.status = 'ACTIVE'
     GROUP BY s.stock_code, s.name
     ORDER BY score DESC, s.stock_code ASC
     LIMIT ?`,
    [seedCode, seedCode, limit]
  );
  return rows;
};

// 기준 종목을 못 찾았을 때의 대체 — 이름·코드로 시작하는 종목을 그대로 제안한다.
// 연관이라기보다 오타·부분입력 보정에 가깝지만, 빈 화면보다는 낫다.
const findByPrefix = async (q, limit) => {
  const [rows] = await pool.query(
    `SELECT stock_code, name, 0 AS score FROM Stocks
     WHERE status = 'ACTIVE' AND (name LIKE ? OR stock_code LIKE ?)
     ORDER BY CHAR_LENGTH(name) ASC, stock_code ASC
     LIMIT ?`,
    [`${q}%`, `${q}%`, limit]
  );
  return rows;
};

module.exports = { findSeedStock, findRelatedStocks, findByPrefix, TAG_WEIGHT, WATCHLIST_WEIGHT };
