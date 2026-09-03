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
  assert.match(source, /router\.post\('\/kakao', authController\.kakaoLogin\)/);
  assert.match(source, /router\.post\('\/naver', authController\.naverLogin\)/);
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
