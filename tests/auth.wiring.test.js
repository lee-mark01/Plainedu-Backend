// 인증·온보딩 라우팅 배선 검증 — 의존성 0, DB/Redis 불필요.
// `node --test tests/`로 실행.
//
// 이 파일이 있는 이유: 휴대폰 인증과 약관 동의는 서비스·컨트롤러가 따로 있는데도 라우터에
// 연결되지 않으면 아무 신호 없이 404가 된다. 폐기된 브랜치에서 코드를 되살릴 때 실제로
// 컨트롤러만 오고 배선이 빠진 적이 있어(2026-09-03) 그 상태를 테스트로 고정한다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('인증 라우터가 휴대폰 인증 두 경로를 노출한다', () => {
  const source = read('src/domains/auth/auth.router.js');

  assert.match(source, /router\.post\('\/phone\/send',[^\n]*phoneVerificationController\.sendCode\)/);
  assert.match(source, /router\.post\('\/phone\/verify',[^\n]*phoneVerificationController\.verifyCode\)/);
});

test('발송 계열 경로에 레이트리밋이 걸려 있다', () => {
  const source = read('src/domains/auth/auth.router.js');

  // 메일·문자는 건당 비용이 나가고 제3자에게 발송된다. 리밋이 없으면 계정 하나로
  // 임의의 주소·번호에 무제한 발송이 가능하다.
  assert.match(source, /router\.post\('\/email\/send',[^\n]*rateLimit\('email-send'/);
  assert.match(source, /router\.post\('\/phone\/send',[^\n]*rateLimit\('phone-send'/);
  // 코드 무차별 대입 차단.
  assert.match(source, /router\.post\('\/email\/verify',[^\n]*rateLimit\('email-verify'/);
  assert.match(source, /router\.post\('\/phone\/verify',[^\n]*rateLimit\('phone-verify'/);
});

test('유저 라우터가 약관 동의 부분 수정 경로를 노출한다', () => {
  const source = read('src/domains/user/user.router.js');

  assert.match(source, /'\/me\/agreements'/);
  assert.match(source, /agreementController\.patchAgreements/);
  assert.match(source, /validate\(agreementsSchema\)/);
});

test('마이페이지 응답이 동의 상태와 휴대폰 인증 여부를 함께 내려준다', () => {
  // 온보딩 진행 판정이 GET /users/me 한 번으로 끝나야 한다. 조회 API가 따로 생기면
  // 프론트가 화면마다 호출 수를 다르게 가져가고 상태가 어긋난다.
  const source = read('src/domains/user/user.service.js');

  assert.match(source, /agreementService\.getAgreements\(userId\)/);
  assert.match(source, /agreements,/);
  assert.match(source, /phone: profile\.phone/);
});

test('OpenAPI가 휴대폰 인증과 약관 동의 계약을 문서화한다', () => {
  const spec = yaml.load(read('docs/openapi.yaml'));

  assert.ok(spec.paths['/api/auth/phone/send']?.post);
  assert.ok(spec.paths['/api/auth/phone/verify']?.post);
  assert.ok(spec.paths['/api/users/me/agreements']?.patch);

  // 프론트 타이머가 이 두 값을 쓴다 — 빠지면 화면에서 카운트다운을 못 띄운다.
  const sendData = spec.paths['/api/auth/phone/send'].post.responses['200']
    .content['application/json'].schema.allOf[1].properties.data.properties;
  assert.ok(sendData.cooldownSeconds);
  assert.ok(sendData.expiresInSeconds);

  assert.ok(spec.components.schemas.Agreements);
  assert.ok(spec.components.schemas.MyProfile.properties.agreements);
  assert.ok(spec.components.schemas.MyProfile.properties.phone);
});

test('브라우저 OAuth 계약이 살아있다', () => {
  // 폐기된 develop을 되살리면서 main에만 있던 이 경로들을 덮어쓸 뻔했다.
  // 프론트 로그인이 전부 여기에 걸려 있어 회귀를 명시적으로 막는다.
  const source = read('src/domains/auth/auth.router.js');

  assert.match(source, /router\.get\('\/kakao\/start'/);
  assert.match(source, /router\.get\('\/naver\/start'/);
  assert.match(source, /router\.post\('\/oauth-ticket'/);
  assert.match(source, /router\.post\('\/firebase-token'/);
  assert.match(source, /router\.post\(\s*'\/qa-session'/);
});
