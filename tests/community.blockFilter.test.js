// 차단 필터 조각 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
//
// 이 필터가 커뮤니티 조회 8곳에 같은 형태로 들어간다. 조각이 틀리면 차단이 한 방향만
// 걸리거나(회피 가능) 파라미터 순서가 어긋나 엉뚱한 결과가 나온다.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { blockFilter, blockFilterClause } = require('../src/domains/community/blockFilter');

// 공백을 하나로 눌러 비교한다 — 들여쓰기가 바뀌어도 의미가 같으면 통과해야 한다.
const squash = (s) => s.replace(/\s+/g, ' ').trim();

test('비로그인 뷰어에게는 필터가 붙지 않는다', () => {
  // 커뮤니티 조회는 공개다. 보는 사람이 정해지지 않으면 차단 개념 자체가 없다.
  for (const viewer of [undefined, null, 0]) {
    assert.deepEqual(blockFilter('p.user_id', viewer), { sql: '', params: [] });
    assert.deepEqual(blockFilterClause('p.user_id', viewer), { sql: '', params: [] });
  }
});

test('차단을 양방향으로 가린다', () => {
  const { sql, params } = blockFilter('p.user_id', 7);

  // 내가 차단한 사람 + 나를 차단한 사람 두 방향이 모두 있어야 한다.
  // 한 방향만 있으면 차단당한 쪽이 상대를 계속 볼 수 있다.
  assert.match(squash(sql), /b\.blocker_id = \? AND b\.blocked_id = p\.user_id/);
  assert.match(squash(sql), /b\.blocked_id = \? AND b\.blocker_id = p\.user_id/);
  assert.match(squash(sql), /NOT EXISTS/);

  // 플레이스홀더 개수와 파라미터 개수가 맞아야 한다 — 어긋나면 쿼리 전체가 밀린다.
  assert.equal((sql.match(/\?/g) || []).length, params.length);
  assert.deepEqual(params, [7, 7]);
});

test('작성자 컬럼이 그대로 박힌다', () => {
  // 테이블마다 작성자 컬럼이 다르다 (p.user_id, c.user_id, n.sender_id, f.follower_id ...)
  for (const column of ['c.user_id', 'n.sender_id', 'f.followee_id']) {
    assert.ok(blockFilter(column, 3).sql.includes(column));
  }
});

test('clause 형태는 AND로 시작한다', () => {
  // 고정 WHERE 절에 이어붙이는 쪽이 쓴다. AND가 빠지면 SQL 문법 오류가 난다.
  const { sql, params } = blockFilterClause('p.user_id', 7);
  assert.match(squash(sql), /^AND NOT EXISTS/);
  assert.deepEqual(params, [7, 7]);
});
