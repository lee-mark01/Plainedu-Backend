const pool = require('../../config/db');

// 신호를 계산할 종목 목록 + 우리 서비스 안에서의 인기도.
//
// 인기도는 외부 지표가 아니라 **이 서비스 사용자들의 관심**이다 — 관심목록에 담은 수와
// 글에 태그된 수를 합산한다. 거래량 같은 시장 지표를 쓰려면 종목마다 추가 조회가 필요한데,
// 요청 16의 "인기 종목"은 투자 홈에 띄울 목록이라 우리 사용자 기준이 더 맞다.
//
// 글 태그에 가중치를 더 준다(x2): 관심목록은 담아두고 잊기 쉽지만, 글을 쓰는 건 더 큰 행동이다.
// (relatedTerms와 같은 이유·같은 비율이라 두 기능의 "인기" 감각이 어긋나지 않는다)
const WATCHLIST_WEIGHT = 1;
const TAG_WEIGHT = 2;

// 지표 계산은 종목당 일봉 시리즈 한 번씩이라(캐시 히트면 0크레딧, 미스면 1크레딧)
// 대상 수가 곧 비용이다. 상한을 둬서 종목이 늘어도 한 번의 요청이 예산을 삼키지 않게 한다.
const UNIVERSE_LIMIT = 30;

const findUniverse = async (limit = UNIVERSE_LIMIT) => {
  const [rows] = await pool.query(
    `SELECT s.stock_code, s.name,
            IFNULL(w.cnt, 0) AS watchlist_count,
            IFNULL(t.cnt, 0) AS tag_count,
            (IFNULL(w.cnt, 0) * ${WATCHLIST_WEIGHT} + IFNULL(t.cnt, 0) * ${TAG_WEIGHT}) AS popularity
     FROM Stocks s
     LEFT JOIN (
       SELECT stock_code, COUNT(*) AS cnt FROM Watchlist GROUP BY stock_code
     ) w ON w.stock_code = s.stock_code
     LEFT JOIN (
       SELECT pst.stock_code, COUNT(*) AS cnt
       FROM PostStockTags pst
       JOIN CommunityPosts p ON p.id = pst.post_id AND p.deleted_at IS NULL
       GROUP BY pst.stock_code
     ) t ON t.stock_code = s.stock_code
     WHERE s.status = 'ACTIVE'
     ORDER BY popularity DESC, s.stock_code ASC
     LIMIT ?`,
    [limit]
  );
  return rows;
};

module.exports = { findUniverse, UNIVERSE_LIMIT, WATCHLIST_WEIGHT, TAG_WEIGHT };
