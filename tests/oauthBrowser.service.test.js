const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  createOAuthBrowserService,
  buildFrontendRedirect,
} = require('../src/domains/auth/oauthBrowser.service');

const createStore = () => {
  const values = new Map();
  const writes = [];
  return {
    values,
    writes,
    async set(key, value, mode, ttl) {
      writes.push({ key, value, mode, ttl });
      values.set(key, value);
    },
    async getdel(key) {
      const value = values.get(key) ?? null;
      values.delete(key);
      return value;
    },
  };
};

const providerConfig = {
  kakao: {
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    clientId: 'kakao-client',
    redirectUri: 'https://api.plainedu.org/auth/kakao/callback',
  },
  naver: {
    authorizeUrl: 'https://nid.naver.com/oauth2.0/authorize',
    clientId: 'naver-client',
    redirectUri: 'https://api.plainedu.org/auth/naver/callback',
  },
};

const createService = ({ oauthLogin } = {}) => {
  const store = createStore();
  const randomValues = ['state-token', 'ticket-token'];
  const service = createOAuthBrowserService({
    store,
    providerConfig,
    oauthLogin: oauthLogin || (async () => ({
      accessToken: 'backend-access',
      refreshToken: 'backend-refresh',
      user: { id: 7, email: 'student@example.com' },
      isNew: true,
    })),
    randomToken: () => randomValues.shift(),
  });
  return { service, store };
};

test('카카오 시작 URL은 백엔드 callback과 10분 state를 사용한다', async () => {
  const { service, store } = createService();

  const result = await service.createAuthorization(
    'kakao',
    'https://www.plainedu.org/auth/callback',
  );

  const authorizationUrl = new URL(result.authorizationUrl);
  assert.equal(authorizationUrl.origin + authorizationUrl.pathname, providerConfig.kakao.authorizeUrl);
  assert.equal(authorizationUrl.searchParams.get('client_id'), 'kakao-client');
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), providerConfig.kakao.redirectUri);
  assert.equal(authorizationUrl.searchParams.get('response_type'), 'code');
  assert.equal(authorizationUrl.searchParams.get('state'), 'state-token');
  assert.deepEqual(store.writes[0], {
    key: 'oauth:state:kakao:state-token',
    value: JSON.stringify({ returnTo: 'https://www.plainedu.org/auth/callback' }),
    mode: 'EX',
    ttl: 600,
  });
});

test('네이버 시작 URL도 백엔드 callback을 사용한다', async () => {
  const { service } = createService();
  const result = await service.createAuthorization(
    'naver',
    'https://plainedu.org/auth/callback',
  );

  const authorizationUrl = new URL(result.authorizationUrl);
  assert.equal(authorizationUrl.origin + authorizationUrl.pathname, providerConfig.naver.authorizeUrl);
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), providerConfig.naver.redirectUri);
  assert.equal(authorizationUrl.searchParams.get('state'), 'state-token');
});

test('등록되지 않은 프론트 callback과 localhost는 로그인 시작 전에 거부한다', async () => {
  const { service } = createService();

  for (const returnTo of [
    'https://evil.example/auth/callback',
    'http://localhost:8081/auth/callback',
    'https://www.plainedu.org/other',
  ]) {
    await assert.rejects(
      service.createAuthorization('kakao', returnTo),
      (error) => error.status === 400 && error.code === 'OAUTH_RETURN_TO_INVALID',
    );
  }
});

test('callback은 state를 한 번만 소비하고 세션을 60초 ticket으로 보관한다', async () => {
  const calls = [];
  const { service, store } = createService({
    oauthLogin: async (...args) => {
      calls.push(args);
      return {
        accessToken: 'backend-access',
        refreshToken: 'backend-refresh',
        user: { id: 7 },
        isNew: false,
      };
    },
  });
  await service.createAuthorization('kakao', 'https://www.plainedu.org/auth/callback');

  const completed = await service.consumeCallback(
    'kakao',
    { code: 'provider-code', state: 'state-token' },
    { ipAddress: '203.0.113.7', userAgent: 'test-browser' },
  );

  assert.deepEqual(calls, [[
    'kakao',
    'provider-code',
    { ipAddress: '203.0.113.7', userAgent: 'test-browser', state: 'state-token' },
  ]]);
  assert.equal(completed.returnTo, 'https://www.plainedu.org/auth/callback');
  assert.equal(completed.ticket, 'ticket-token');
  assert.equal(completed.isNew, false);
  assert.deepEqual(store.writes[1], {
    key: 'oauth:ticket:ticket-token',
    value: JSON.stringify({
      accessToken: 'backend-access',
      refreshToken: 'backend-refresh',
      user: { id: 7 },
      isNew: false,
    }),
    mode: 'EX',
    ttl: 60,
  });
  await assert.rejects(
    service.consumeCallback('kakao', { code: 'again', state: 'state-token' }, {}),
    (error) => error.status === 400 && error.code === 'OAUTH_STATE_INVALID',
  );
});

test('ticket은 한 번만 세션으로 교환할 수 있다', async () => {
  const { service } = createService();
  await service.createAuthorization('naver', 'plainedu://auth/callback');
  const completed = await service.consumeCallback(
    'naver',
    { code: 'provider-code', state: 'state-token' },
    {},
  );

  assert.deepEqual(await service.consumeTicket(completed.ticket), {
    accessToken: 'backend-access',
    refreshToken: 'backend-refresh',
    user: { id: 7, email: 'student@example.com' },
    isNew: true,
  });
  await assert.rejects(
    service.consumeTicket(completed.ticket),
    (error) => error.status === 400 && error.code === 'OAUTH_TICKET_INVALID',
  );
});

test('공급자가 거절하면 프로필 교환 없이 안전한 오류만 프론트에 전달한다', async () => {
  let loginCalls = 0;
  const { service } = createService({
    oauthLogin: async () => { loginCalls += 1; },
  });
  await service.createAuthorization('kakao', 'https://www.plainedu.org/auth/callback');

  const completed = await service.consumeCallback(
    'kakao',
    { error: 'access_denied', state: 'state-token' },
    {},
  );

  assert.equal(loginCalls, 0);
  assert.deepEqual(completed, {
    returnTo: 'https://www.plainedu.org/auth/callback',
    error: 'OAUTH_PROVIDER_DENIED',
  });
});

test('공급자 token 또는 프로필 교환 실패는 내부 메시지 없이 안정적인 오류 코드로 바꾼다', async () => {
  const { service } = createService({
    oauthLogin: async () => {
      const error = new Error('client_secret and upstream response must stay private');
      error.code = 'EMAIL_REQUIRED';
      throw error;
    },
  });
  await service.createAuthorization('kakao', 'https://www.plainedu.org/auth/callback');

  const completed = await service.consumeCallback(
    'kakao',
    { code: 'provider-code', state: 'state-token' },
    {},
  );

  assert.deepEqual(completed, {
    returnTo: 'https://www.plainedu.org/auth/callback',
    error: 'EMAIL_REQUIRED',
  });
});

test('프론트 리다이렉트에는 ticket 또는 오류 코드만 fragment로 포함한다', () => {
  assert.equal(
    buildFrontendRedirect('https://www.plainedu.org/auth/callback', { ticket: 'opaque-ticket' }),
    'https://www.plainedu.org/auth/callback#ticket=opaque-ticket',
  );
  assert.equal(
    buildFrontendRedirect('plainedu://auth/callback', { error: 'OAUTH_PROVIDER_DENIED' }),
    'plainedu://auth/callback#oauth_error=OAUTH_PROVIDER_DENIED',
  );
  assert.equal(buildFrontendRedirect(
    'https://www.plainedu.org/auth/callback',
    { ticket: 'opaque-ticket', accessToken: 'must-not-leak' },
  ).includes('must-not-leak'), false);
});
