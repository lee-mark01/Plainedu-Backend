const pool = require('../../config/db');
const { blockFilter } = require('./blockFilter');

// 팔로우할 만한 사용자 추천.
//
// 신호 두 가지를 합산한다:
//   - 관심사 유사도: 내 Watchlist와 겹치는 종목 수. 같은 종목을 담았다는 건 이 서비스에서
//     드러낼 수 있는 가장 직접적인 관심 표현이다(글 태그는 글을 써야만 생긴다).
//   - 활동량: 최근 30일 작성 글 수. 아무 글도 안 쓰는 사람을 추천하면 팔로우해도 피드가 빈다.
//
// 관심사에 가중치를 더 준다(x10). 활동량만 높은 사람은 아무에게나 추천되지만,
// 겹치는 관심 종목은 그 사람에게만 해당하는 이유이기 때문이다.
//
// 제외 대상: 본인, 이미 팔로우한 사람, 차단 관계(양방향).
// 차단은 blockFilter를 그대로 쓴다 — 커뮤니티 조회 전반과 같은 규칙이어야 한다.
const ACTIVITY_WINDOW_DAYS = 30;
const INTEREST_WEIGHT = 10;

const findSuggestedUsers = async (viewer_id, limit) => {
  const block = blockFilter('u.id', viewer_id);

  const [rows] = await pool.query(
    `SELECT
       u.id AS user_id,
       u.nickname,
       COUNT(DISTINCT mine.stock_code) AS shared_interests,
       COUNT(DISTINCT p.id)            AS recent_post_count
     FROM Users u
     -- 관심사: 내가 담은 종목을 상대도 담았는가
     LEFT JOIN Watchlist theirs ON theirs.user_id = u.id
     LEFT JOIN Watchlist mine   ON mine.user_id = ? AND mine.stock_code = theirs.stock_code
     -- 활동량: 최근 30일 글
     LEFT JOIN CommunityPosts p
       ON p.user_id = u.id
      AND p.deleted_at IS NULL
      AND p.created_at >= DATE_SUB(NOW(), INTERVAL ${ACTIVITY_WINDOW_DAYS} DAY)
     WHERE u.id <> ?
       -- 이미 팔로우한 사람은 추천할 이유가 없다
       AND NOT EXISTS (
         SELECT 1 FROM Follows f WHERE f.follower_id = ? AND f.followee_id = u.id
       )
       ${block.sql ? `AND ${block.sql}` : ''}
     GROUP BY u.id, u.nickname
     -- 겹치는 관심사도 없고 최근 글도 없으면 추천할 근거가 하나도 없다
     HAVING shared_interests > 0 OR recent_post_count > 0
     ORDER BY (shared_interests * ${INTEREST_WEIGHT} + recent_post_count) DESC, u.id ASC
     LIMIT ?`,
    [viewer_id, viewer_id, viewer_id, ...block.params, limit]
  );

  return rows;
};

module.exports = { findSuggestedUsers, ACTIVITY_WINDOW_DAYS, INTEREST_WEIGHT };
