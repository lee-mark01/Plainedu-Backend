// 프론트 콜백을 쓰는 로그인(방법 B)의 핵심 계약 검증 - DB/Redis 불필요, 외부 API도 타지 않는다.
//
// 프론트가 인가 요청에 쓴 redirect_uri를 그대로 교환 요청에 실어야 한다. 값이 컨트롤러 ->
// 서비스 -> provider 4단계를 거쳐 전달되는 구조라 중간에서 빠뜨리기 쉽고, 빠뜨리면 조용히
// env 폴백으로 넘어가 카카오/구글에서 400으로만 드러난다. 원인 찾기가 고약해서 여기서 못 박는다.
const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const kakao = require('../src/domains/auth/providers/kakao');
const google = require('../src/domains/auth/providers/google');

const FRONT_CB = 'https://app.plainedu.org/auth/callback';

// axios.post를 가로채 교환 요청 본문만 캡처한다 (실제 호출 없음)
const captureExchange = () => {
  const captured = {};
  mock.method(axios, 'post', async (url, body) => {
    captured.params = new URLSearchParams(body);
    return { data: { access_token: 'provider-token' } };
  });
  return captured;
};

afterEach(() => mock.restoreAll());

test('kakao: 프론트가 준 redirect_uri를 그대로 교환에 쓴다', async () => {
  const captured = captureExchange();
  await kakao.exchangeCode('CODE', { redirectUri: FRONT_CB });
  assert.equal(captured.params.get('redirect_uri'), FRONT_CB);
});

test('kakao: redirect_uri가 없으면 env 기본값으로 폴백한다 (기존 GET 콜백 경로 보존)', async () => {
  process.env.KAKAO_REDIRECT_URI = 'https://api.plainedu.org/auth/kakao/callback';
  const captured = captureExchange();
  await kakao.exchangeCode('CODE');
  assert.equal(captured.params.get('redirect_uri'), 'https://api.plainedu.org/auth/kakao/callback');
});

test('google: 프론트가 준 redirect_uri를 그대로 교환에 쓴다', async () => {
  const captured = captureExchange();
  await google.exchangeCode('CODE', { redirectUri: FRONT_CB });
  assert.equal(captured.params.get('redirect_uri'), FRONT_CB);
});

test('google: redirect_uri가 없으면 env 기본값으로 폴백한다', async () => {
  process.env.GOOGLE_REDIRECT_URI = 'https://api.plainedu.org/auth/google/callback';
  const captured = captureExchange();
  await google.exchangeCode('CODE');
  assert.equal(captured.params.get('redirect_uri'), 'https://api.plainedu.org/auth/google/callback');
});
