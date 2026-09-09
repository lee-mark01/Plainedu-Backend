// 신고·차단 배선과 입력 검증 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const {
  createReportSchema,
  blockUserSchema,
  blockListSchema,
} = require('../src/domains/community/moderation.validator');

test('신고는 대상 종류·대상·사유를 모두 요구한다', () => {
  assert.ok(createReportSchema.validate({ target_type: 'POST', target_id: 4, reason: 'SPAM' }).error === undefined);
  assert.ok(createReportSchema.validate({ target_id: 4, reason: 'SPAM' }).error);
  assert.ok(createReportSchema.validate({ target_type: 'TEAM', target_id: 4, reason: 'SPAM' }).error);
  assert.ok(createReportSchema.validate({ target_type: 'POST', target_id: 4, reason: 'WHATEVER' }).error);
});

test('기타 사유는 상세 내용을 함께 요구한다', () => {
  // ETC만 받고 상세가 없으면 접수돼도 무엇이 문제인지 알 수 없어 처리할 수 없다.
  assert.ok(createReportSchema.validate({ target_type: 'POST', target_id: 4, reason: 'ETC' }).error);
  assert.ok(
    createReportSchema.validate({ target_type: 'POST', target_id: 4, reason: 'ETC', detail: '광고 도배' })
      .error === undefined
  );
});

test('차단 목록은 page/limit 기본값을 채운다', () => {
  const { value, error } = blockListSchema.validate({});
  assert.equal(error, undefined);
  assert.equal(value.page, 1);
  assert.equal(value.limit, 20);
});

test('차단은 대상 사용자를 요구한다', () => {
  assert.ok(blockUserSchema.validate({}).error);
  assert.equal(blockUserSchema.validate({ user_id: 12 }).error, undefined);
});

test('신고·차단 경로가 인증을 요구한다', () => {
  // 누가 신고·차단하는지가 곧 데이터다. 비인증이면 기록할 주체가 없다.
  const source = read('src/domains/community/community.router.js');

  for (const route of [
    /router\.post\('\/reports', authenticate/,
    /router\.get\('\/blocks', authenticate/,
    /router\.post\('\/blocks', authenticate/,
    /router\.delete\('\/blocks\/:userId', authenticate/,
  ]) {
    assert.match(source, route);
  }
});

test('공개 조회 경로가 선택적 인증을 거친다', () => {
  // authenticate를 걸 수 없는 공개 경로들이다. optionalAuthenticate가 없으면 로그인한
  // 사용자가 토큰을 보내도 req.user가 비어 차단 필터가 아무 일도 하지 않는다.
  const source = read('src/domains/community/community.router.js');

  for (const route of [
    /router\.get\('\/posts\/:id', optionalAuthenticate/,
    /router\.get\('\/posts', optionalAuthenticate/,
    /router\.get\('\/posts\/:post_id\/comments', optionalAuthenticate/,
    /router\.get\('\/hot\/posts', optionalAuthenticate/,
    /router\.get\('\/users\/:user_id\/followers', optionalAuthenticate/,
    /router\.get\('\/users\/:user_id\/followings', optionalAuthenticate/,
  ]) {
    assert.match(source, route);
  }
});

test('선택적 인증은 토큰 상태와 무관하게 통과시킨다', () => {
  // 공개 조회를 인증 실패로 막으면 비로그인과 같은 화면을 보여줘야 할 상황에서 에러가 나간다.
  process.env.JWT_ACCESS_SECRET = 'test-secret';
  const { signAccessToken } = require('../src/utils/jwt');
  const optionalAuthenticate = require('../src/middlewares/optionalAuthenticate');

  const run = (authorization) => {
    const req = { headers: authorization ? { authorization } : {} };
    const passed = [];
    optionalAuthenticate(req, {}, (err) => passed.push(err ?? null));
    return { req, passed };
  };

  // 토큰 없음 → 통과, 뷰어 없음
  const none = run(null);
  assert.deepEqual(none.passed, [null]);
  assert.equal(none.req.user, undefined);

  // 위조 토큰 → 401이 아니라 통과, 뷰어 없음 (비로그인과 동일 취급)
  const bogus = run('Bearer not-a-real-token');
  assert.deepEqual(bogus.passed, [null]);
  assert.equal(bogus.req.user, undefined);

  // 유효 토큰 → 통과하면서 뷰어를 채운다. 이게 없으면 차단 필터가 동작하지 않는다.
  const valid = run(`Bearer ${signAccessToken({ userId: 7 })}`);
  assert.deepEqual(valid.passed, [null]);
  assert.equal(valid.req.user.userId, 7);
});

test('차단 필터가 커뮤니티 조회 경로에 적용됐다', () => {
  const paths = [
    ['post.repository.js', 'p.user_id'],
    ['comment.repository.js', 'c.user_id'],
    ['hot.repository.js', 'p.user_id'],
    ['follow.repository.js', 'f.follower_id'],
    ['interaction.repository.js', 'p.user_id'],
    ['notification.repository.js', 'n.sender_id'],
  ];

  for (const [file, column] of paths) {
    const source = read(`src/domains/community/${file}`);
    assert.match(source, /blockFilter/, `${file}에 차단 필터가 없다`);
    assert.ok(source.includes(column), `${file}이 ${column}로 필터하지 않는다`);
  }
});

test('차단하면 서로의 팔로우를 끊는다', () => {
  // 팔로우가 남으면 활동 알림이 계속 오고 팔로워 수에도 잡힌다.
  const source = read('src/domains/community/block.service.js');

  assert.match(source, /withTransaction/);
  assert.match(source, /deleteFollow\(userId, targetUserId, conn\)/);
  assert.match(source, /deleteFollow\(targetUserId, userId, conn\)/);
});

test('OpenAPI가 신고·차단 계약을 문서화한다', () => {
  const spec = yaml.load(read('docs/openapi.yaml'));

  assert.ok(spec.paths['/api/community/reports']?.post);
  assert.ok(spec.paths['/api/community/blocks']?.get);
  assert.ok(spec.paths['/api/community/blocks']?.post);
  assert.ok(spec.paths['/api/community/blocks/{userId}']?.delete);

  // 신고 사유는 프론트가 선택지를 그리는 근거라 값 집합이 계약이다.
  const reason = spec.paths['/api/community/reports'].post.requestBody
    .content['application/json'].schema.properties.reason;
  assert.deepEqual(reason.enum, ['SPAM', 'ABUSE', 'ADULT', 'FALSE_INFO', 'ETC']);
});
