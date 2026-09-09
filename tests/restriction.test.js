// 이용 제한·이의신청과 관리자 권한 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
//
// 정책(2026-09-09 결정): 부과 주체는 관리자(Users.role = ADMIN). 제한 종류는
// 커뮤니티 전체 금지 하나. 신고 누적 자동 제재는 넣지 않았다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const requireAdmin = require('../src/middlewares/requireAdmin');
const {
  submitAppealSchema,
  createRestrictionSchema,
  decideAppealSchema,
} = require('../src/domains/community/restriction.validator');
const { activeCondition } = require('../src/domains/community/restriction.repository');

const runMiddleware = (mw, req) => {
  const calls = [];
  mw(req, {}, (err) => calls.push(err ?? null));
  return calls;
};

test('관리자 게이트는 role만 보고 판단한다', () => {
  assert.deepEqual(runMiddleware(requireAdmin, { user: { userId: 1, role: 'ADMIN' } }), [null]);

  for (const user of [{ role: 'USER' }, {}, undefined]) {
    const [err] = runMiddleware(requireAdmin, { user });
    assert.ok(err, `${JSON.stringify(user)}가 통과했다`);
    assert.equal(err.status, 403);
    assert.equal(err.code, 'ADMIN_ONLY');
  }
});

test('유효한 제한 판정에 만료 시각이 들어간다', () => {
  // 만료를 배치로 EXPIRED로 바꾸지 않으므로, 시각 비교가 빠지면 만료된 제한에 계속 걸린다.
  const sql = activeCondition();
  assert.match(sql, /status = 'ACTIVE'/);
  assert.match(sql, /ends_at IS NULL OR ends_at > NOW\(\)/);

  // 조인 쿼리용 별칭이 조건 전체에 붙어야 한다 — 하나만 붙으면 조건이 조용히 망가진다.
  const aliased = activeCondition('r');
  assert.match(aliased, /r\.status = 'ACTIVE'/);
  assert.match(aliased, /r\.ends_at IS NULL OR r\.ends_at > NOW\(\)/);
  assert.doesNotMatch(aliased, /(?<!r\.)\bstatus\b/);
});

test('제한 기간은 days로 받고 생략하면 무기한이다', () => {
  // 클라이언트가 보낸 시각을 그대로 쓰면 시간대 해석이 갈려 의도한 기간과 어긋난다.
  assert.equal(createRestrictionSchema.validate({ user_id: 1, reason: 'ABUSE' }).error, undefined);
  assert.equal(
    createRestrictionSchema.validate({ user_id: 1, reason: 'ABUSE', days: 7 }).error,
    undefined
  );
  assert.ok(createRestrictionSchema.validate({ user_id: 1, reason: 'ABUSE', days: 0 }).error);

  // ends_at을 직접 받지 않는다.
  const spec = yaml.load(read('docs/openapi.yaml'));
  const body = spec.paths['/api/admin/restrictions'].post.requestBody
    .content['application/json'].schema.properties;
  assert.ok(body.days);
  assert.equal(body.ends_at, undefined);
});

test('기타 사유는 상세 내용을 함께 요구한다', () => {
  assert.ok(createRestrictionSchema.validate({ user_id: 1, reason: 'ETC' }).error);
  assert.equal(
    createRestrictionSchema.validate({ user_id: 1, reason: 'ETC', detail: '반복 도배' }).error,
    undefined
  );
});

test('이의신청은 제한 건과 충분한 내용을 요구한다', () => {
  assert.ok(submitAppealSchema.validate({ restriction_id: 1 }).error);
  assert.ok(submitAppealSchema.validate({ restriction_id: 1, content: '짧음' }).error);
  assert.equal(
    submitAppealSchema.validate({ restriction_id: 1, content: '오해가 있었습니다. 확인 부탁드립니다.' }).error,
    undefined
  );
  assert.ok(decideAppealSchema.validate({ decision: 'MAYBE' }).error);
});

test('제한 중에도 상태 조회와 이의신청은 할 수 있다', () => {
  // 여기까지 막으면 사용자가 왜 막혔는지도 모르고 이의도 못 한다.
  const router = read('src/domains/community/community.router.js');
  const start = router.indexOf("'/restrictions/me'");
  const end = router.indexOf('신고·차단');
  const block = router.slice(start, end);

  assert.doesNotMatch(block, /requireNotRestricted/);
});

test('쓰기 경로에만 제한이 걸린다', () => {
  const router = read('src/domains/community/community.router.js');
  const line = (needle) =>
    router.split('\n').find((l) => l.includes(needle)) || '';

  // 막는 것 — 다른 사람에게 보이는 콘텐츠·상호작용 생산
  for (const needle of [
    "router.post('/posts'",
    "router.patch('/posts/:id'",
    "router.post('/posts/:post_id/comments'",
    "router.patch('/comments/:comment_id'",
    "router.post('/posts/:post_id/like'",
    "router.post('/comments/:comment_id/like'",
    "router.post('/users/:user_id/follow'",
  ]) {
    assert.match(line(needle), /requireNotRestricted/, `${needle}에 제한이 없다`);
  }

  // 막지 않는 것 — 삭제(자기 글 정리), 북마크(개인 저장), 신고·차단(자기 보호)
  for (const needle of [
    "router.delete('/posts/:id'",
    "router.delete('/comments/:comment_id'",
    "router.post('/posts/:post_id/bookmark'",
    "router.post('/reports'",
    "router.post('/blocks'",
  ]) {
    assert.doesNotMatch(line(needle), /requireNotRestricted/, `${needle}이 막혀 있다`);
  }
});

test('제한 여부를 토큰이 아니라 DB에서 본다', () => {
  // 토큰에 담으면 발급 시점 값이 굳어 제재 후에도 만료까지 활동할 수 있다.
  const mw = read('src/domains/community/requireNotRestricted.js');
  assert.match(mw, /restrictionRepository\.findActiveByUserId\(req\.user\.userId\)/);
  assert.match(mw, /'COMMUNITY_RESTRICTED'/);
});

test('이의신청 승인은 제한 해제까지 한 트랜잭션이다', () => {
  // 받아들였는데 제한이 남으면 결정이 무의미하다.
  const source = read('src/domains/community/restriction.service.js');
  const start = source.indexOf('const decideAppeal');
  const body = source.slice(start);

  assert.match(body, /withTransaction/);
  assert.match(body, /decideAppeal\(appealId, status, adminId, adminComment, conn\)/);
  assert.match(body, /liftRestriction\(appeal\.restriction_id, adminId, conn\)/);
});

test('중복 처리를 상태 조건으로 막는다', () => {
  const restriction = read('src/domains/community/restriction.repository.js');
  const appeal = read('src/domains/community/appeal.repository.js');

  assert.match(restriction, /WHERE id = \? AND status = 'ACTIVE'/);
  assert.match(appeal, /WHERE id = \? AND status IN \('RECEIVED','REVIEWING'\)/);
  // 제한 건당 이의신청 하나 — UNIQUE 위반을 409로 바꾼다.
  assert.match(appeal, /ER_DUP_ENTRY/);
});

test('신고 목록이 대상별 누적 신고 수를 함께 준다', () => {
  // 제재 판단의 핵심 근거인데 목록마다 세어보게 하면 안 된다.
  const source = read('src/domains/community/report.repository.js');
  assert.match(source, /target_report_count/);
});

test('관리자 라우터 전체가 게이트를 지난다', () => {
  const router = read('src/domains/admin/admin.router.js');
  const app = read('src/app.js');

  // 핸들러마다 role을 확인하면 한 곳만 빠져도 구멍이 된다.
  assert.match(router, /router\.use\(authenticate, requireAdmin\)/);
  assert.match(app, /app\.use\('\/api\/admin', adminRouter\)/);
});

test('OpenAPI가 제한·관리자 계약을 문서화한다', () => {
  const spec = yaml.load(read('docs/openapi.yaml'));

  for (const p of [
    '/api/community/restrictions/me',
    '/api/community/restriction/appeals',
    '/api/admin/reports',
    '/api/admin/restrictions',
    '/api/admin/restrictions/{restrictionId}',
    '/api/admin/appeals',
    '/api/admin/appeals/{appealId}/decision',
  ]) {
    assert.ok(spec.paths[p], `${p}가 문서에 없다`);
  }

  // 제한이 없는 경우도 정상 응답이라는 게 계약이다.
  const current = spec.components.schemas.MyRestriction.properties.current;
  assert.equal(current.nullable, true);

  // 관리자 경로는 전부 403을 명시해야 한다 — 프론트가 권한 없음을 구분할 수 있어야 한다.
  for (const [p, ops] of Object.entries(spec.paths)) {
    if (!p.startsWith('/api/admin/')) continue;
    for (const [method, op] of Object.entries(ops)) {
      assert.ok(op.responses['403'], `${method.toUpperCase()} ${p}에 403이 없다`);
    }
  }
});
