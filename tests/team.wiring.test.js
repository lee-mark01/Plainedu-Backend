// 팀 역할·규칙·탈퇴 라우팅 배선 검증 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('팀 라우터가 규칙·탈퇴·역할 경로를 노출한다', () => {
  const source = read('src/domains/team/team.router.js');

  assert.match(source, /router\.get\('\/me\/rules'/);
  assert.match(source, /router\.put\('\/me\/rules'/);
  assert.match(source, /router\.get\('\/me\/exit-options'/);
  assert.match(source, /router\.post\('\/me\/leave'/);
  assert.match(source, /'\/me\/delegate-and-leave'/);
  assert.match(source, /router\.delete\('\/me'/);
  assert.match(source, /'\/me\/members\/:userId\/role'/);
});

test('파라미터 경로가 고정 경로보다 뒤에 선언된다', () => {
  // '/me/members/:userId/role'이 '/me/rules'보다 앞에 오면 express가 먼저 매칭할 위험이 있다.
  // 지금 형태로는 충돌하지 않지만 순서를 고정해두면 나중에 경로가 늘어도 안전하다.
  const source = read('src/domains/team/team.router.js');

  assert.ok(
    source.indexOf("'/me/rules'") < source.indexOf("'/me/members/:userId/role'"),
    '파라미터 경로가 고정 경로보다 앞에 선언됐다'
  );
});

test('파괴적 경로에 소유권 검사가 걸려 있다', () => {
  // 팀장 확인 없이 해체·위임이 열리면 팀원 누구나 팀을 지울 수 있다.
  const source = read('src/domains/team/team.service.js');

  assert.match(source, /팀장만 팀을 해체할 수 있습니다/);
  assert.match(source, /팀장만 위임할 수 있습니다/);
  assert.match(source, /팀장만 팀 규칙을 수정할 수 있습니다/);
  assert.match(source, /팀장만 팀원의 역할을 변경할 수 있습니다/);
});

test('탈퇴·위임·해체가 한 트랜잭션으로 묶인다', () => {
  // 위임만 되고 탈퇴가 안 되면 팀장이 둘이 되고, 반대면 팀장이 사라진다.
  const source = read('src/domains/team/team.service.js');

  for (const fn of ['leaveTeam', 'delegateAndLeave', 'disbandTeam', 'updateMemberRole']) {
    const start = source.indexOf(`const ${fn} = async`);
    assert.ok(start >= 0, `${fn}을 찾지 못했다`);
    const body = source.slice(start, start + 400);
    assert.match(body, /withTransaction/, `${fn}이 트랜잭션 밖에서 실행된다`);
  }
});

test('팀을 떠나면 투자 포지션이 초기화된다', () => {
  // position은 Users 컬럼이라 팀 FK CASCADE 밖이다. 손으로 되돌리지 않으면
  // 팀 없는 유저가 TRADER로 남아 다음 가입 때 포지션 선택이 꼬인다.
  const source = read('src/domains/team/team.service.js');

  assert.match(source, /clearMembershipSideEffects/);
  assert.match(source, /updatePosition\(userId, 'NONE', conn\)/);
});

test('일일 랭킹 스냅샷이 확정 시점 팀 이름을 함께 저장한다', () => {
  // 팀이 해체되면 Teams 조인으로는 이름을 찾을 수 없는데 스냅샷 행은 남는다.
  const service = read('src/domains/ranking/ranking.service.js');
  const repository = read('src/domains/ranking/ranking.repository.js');

  assert.match(service, /target_name: profiles\.get\(teamId\)\?\.team_name/);
  assert.match(repository, /target_name/);
});

test('OpenAPI가 팀 규칙·탈퇴·역할 계약을 문서화한다', () => {
  const spec = yaml.load(read('docs/openapi.yaml'));

  assert.ok(spec.paths['/api/teams/me/rules']?.get);
  assert.ok(spec.paths['/api/teams/me/rules']?.put);
  assert.ok(spec.paths['/api/teams/me/exit-options']?.get);
  assert.ok(spec.paths['/api/teams/me/leave']?.post);
  assert.ok(spec.paths['/api/teams/me/delegate-and-leave']?.post);
  assert.ok(spec.paths['/api/teams/me']?.delete);
  assert.ok(spec.paths['/api/teams/me/members/{userId}/role']?.patch);

  assert.ok(spec.components.schemas.TeamExitOptions);
  assert.ok(spec.components.schemas.TeamLeaveResult);
  assert.ok(spec.components.schemas.TeamRules);

  // leave_effect는 프론트가 버튼 문구를 고르는 근거라 값 집합이 계약이다.
  const effect = spec.components.schemas.TeamExitOptions.properties.leave_effect;
  assert.deepEqual(effect.enum, ['LEAVE', 'AUTO_DELEGATE', 'DISBAND']);
});
