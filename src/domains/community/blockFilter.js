// 차단 관계를 조회 쿼리에 끼워넣는 공유 조각.
//
// 차단은 양방향으로 가린다 — 내가 차단한 사람의 글도, 나를 차단한 사람의 글도 나에게
// 보이지 않는다. 한 방향만 가리면 차단당한 쪽이 상대를 계속 볼 수 있어 회피 수단이 못 된다.
//
// 뷰어가 없으면(비로그인) 빈 조각을 돌려 쿼리를 그대로 둔다. 커뮤니티 조회는 공개라
// 로그인하지 않은 사람에게는 차단 개념 자체가 없다.
//
// 쓰는 쪽은 conditions 배열에 sql을 넣고 params에 params를 펼쳐 넣는다. 파라미터 순서가
// 어긋나기 쉬워 두 값을 한 객체로 함께 돌려준다.

/**
 * @param {string} authorColumn 글·댓글 작성자 컬럼 (예: 'p.user_id')
 * @param {number|null|undefined} viewerId 보는 사람. 없으면 필터하지 않는다.
 * @returns {{ sql: string, params: number[] }}
 */
const blockFilter = (authorColumn, viewerId) => {
  if (!viewerId) return { sql: '', params: [] };

  return {
    sql: `NOT EXISTS (
            SELECT 1 FROM CommunityBlocks b
            WHERE (b.blocker_id = ? AND b.blocked_id = ${authorColumn})
               OR (b.blocked_id = ? AND b.blocker_id = ${authorColumn})
          )`,
    params: [viewerId, viewerId],
  };
};

// WHERE 절에 바로 붙일 형태(`AND (...)`)로 돌려주는 편의 함수.
// 조건 배열을 쓰지 않는 고정 쿼리(댓글·인기글·북마크 등)가 사용한다.
const blockFilterClause = (authorColumn, viewerId) => {
  const { sql, params } = blockFilter(authorColumn, viewerId);
  return { sql: sql ? `AND ${sql}` : '', params };
};

module.exports = { blockFilter, blockFilterClause };
