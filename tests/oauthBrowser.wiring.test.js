const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('인증 라우터가 카카오·네이버 start와 일회용 ticket 교환을 노출한다', () => {
  const source = read('src/domains/auth/auth.router.js');

  assert.match(source, /router\.get\('\/kakao\/start', authController\.kakaoStart\)/);
  assert.match(source, /router\.get\('\/naver\/start', authController\.naverStart\)/);
  assert.match(source, /router\.post\('\/oauth-ticket', authController\.oauthTicket\)/);
  // 기존 직접 교환 endpoint가 살아있는지만 본다. 사이에 미들웨어(rateLimit 등)가 붙는 건 무관하므로
  // 경로와 컨트롤러만 고정한다 — 리미터를 달 때마다 이 테스트가 깨지면 안 된다.
  assert.match(source, /router\.post\('\/kakao',[^\n]*authController\.kakaoLogin\)/);
  assert.match(source, /router\.post\('\/naver',[^\n]*authController\.naverLogin\)/);
});
test('공급자 callback은 전용 컨트롤러를 사용하고 URL에 세션 토큰을 넣지 않는다', () => {
  const appSource = read('src/app.js');
  const controllerSource = read('src/domains/auth/auth.controller.js');

  assert.match(appSource, /app\.get\('\/auth\/kakao\/callback', authController\.kakaoCallback\)/);
  assert.match(appSource, /app\.get\('\/auth\/naver\/callback', authController\.naverCallback\)/);
  assert.match(controllerSource, /buildFrontendRedirect/);
  assert.doesNotMatch(controllerSource, /res\.redirect\([^\n]*(accessToken|refreshToken)/);
});

test('OpenAPI가 브라우저 OAuth start, callback, ticket 계약을 문서화한다', () => {
  const spec = yaml.load(read('docs/openapi.yaml'));

  assert.ok(spec.paths['/api/auth/kakao/start']?.get);
  assert.ok(spec.paths['/api/auth/naver/start']?.get);
  assert.ok(spec.paths['/auth/{provider}/callback']?.get);
  assert.ok(spec.paths['/api/auth/oauth-ticket']?.post);
});

test('환경변수 예시는 대소문자가 일관된 네이버 키와 백엔드 callback을 안내한다', () => {
  const source = read('.env.example');

  assert.match(source, /^NAVER_CLIENT_ID=$/m);
  assert.match(source, /^NAVER_CLIENT_SECRET=$/m);
  assert.match(source, /^NAVER_REDIRECT_URI=https:\/\/api\.plainedu\.org\/auth\/naver\/callback$/m);
  assert.match(source, /^KAKAO_REDIRECT_URI=https:\/\/api\.plainedu\.org\/auth\/kakao\/callback$/m);
  assert.doesNotMatch(source, /^Naver_/m);
});

test('프로덕션 배포는 수동 재실행과 인증 계약 사전검사를 제공한다', () => {
  const workflow = read('.github/workflows/deploy.yml');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /npm run check:openapi/);
  assert.match(workflow, /node --test[^\n]*oauthBrowser\.service\.test\.js[^\n]*oauthBrowser\.wiring\.test\.js/);
});
