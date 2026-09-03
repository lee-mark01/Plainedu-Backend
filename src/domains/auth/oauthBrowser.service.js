const crypto = require('crypto');
const AppError = require('../../errors/AppError');

const STATE_TTL_SECONDS = 10 * 60;
const TICKET_TTL_SECONDS = 60;
const ALLOWED_RETURN_TO = new Set([
  'https://www.plainedu.org/auth/callback',
  'https://plainedu.org/auth/callback',
  'plainedu://auth/callback',
]);
const SAFE_CALLBACK_ERRORS = new Set(['EMAIL_REQUIRED', 'PROVIDER_CONFLICT']);

const DEFAULT_PROVIDER_CONFIG = () => ({
  kakao: {
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    clientId: process.env.KAKAO_CLIENT_ID,
    redirectUri: process.env.KAKAO_REDIRECT_URI,
  },
  naver: {
    authorizeUrl: 'https://nid.naver.com/oauth2.0/authorize',
    clientId: process.env.NAVER_CLIENT_ID,
    redirectUri: process.env.NAVER_REDIRECT_URI,
  },
});

const secureRandomToken = () => crypto.randomBytes(32).toString('hex');

const parseStoredJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const validateReturnTo = (returnTo) => {
  if (typeof returnTo !== 'string' || !ALLOWED_RETURN_TO.has(returnTo)) {
    throw new AppError('허용되지 않은 로그인 복귀 주소입니다.', 400, 'OAUTH_RETURN_TO_INVALID');
  }
  return returnTo;
};

const buildFrontendRedirect = (returnTo, { ticket, error } = {}) => {
  const target = new URL(validateReturnTo(returnTo));
  const fragment = new URLSearchParams();
  if (ticket) fragment.set('ticket', ticket);
  else fragment.set('oauth_error', error || 'OAUTH_LOGIN_FAILED');
  target.hash = fragment.toString();
  return target.toString();
};

const createOAuthBrowserService = ({
  store,
  oauthLogin,
  providerConfig = DEFAULT_PROVIDER_CONFIG(),
  randomToken = secureRandomToken,
}) => {
  const getProvider = (provider) => {
    const config = providerConfig[provider];
    if (!config) {
      throw new AppError('지원하지 않는 로그인 방식입니다.', 400, 'OAUTH_PROVIDER_INVALID');
    }
    if (!config.clientId || !config.redirectUri) {
      throw new AppError('소셜 로그인 서버 설정이 누락되었습니다.', 500, 'OAUTH_CONFIG_MISSING');
    }
    return config;
  };

  const createAuthorization = async (provider, returnTo) => {
    const config = getProvider(provider);
    const safeReturnTo = validateReturnTo(returnTo);
    const state = randomToken();
    await store.set(
      `oauth:state:${provider}:${state}`,
      JSON.stringify({ returnTo: safeReturnTo }),
      'EX',
      STATE_TTL_SECONDS,
    );

    const authorizationUrl = new URL(config.authorizeUrl);
    authorizationUrl.searchParams.set('client_id', config.clientId);
    authorizationUrl.searchParams.set('redirect_uri', config.redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('state', state);

    return { authorizationUrl: authorizationUrl.toString(), state };
  };

  const consumeCallback = async (provider, params, context) => {
    getProvider(provider);
    const state = typeof params?.state === 'string' ? params.state : '';
    if (!state) {
      throw new AppError('OAuth state가 없습니다.', 400, 'OAUTH_STATE_INVALID');
    }

    const stored = await store.getdel(`oauth:state:${provider}:${state}`);
    const stateData = stored && parseStoredJson(stored);
    if (!stateData?.returnTo) {
      throw new AppError('OAuth state가 만료되었거나 이미 사용되었습니다.', 400, 'OAUTH_STATE_INVALID');
    }
    const returnTo = validateReturnTo(stateData.returnTo);

    if (params?.error) {
      return { returnTo, error: 'OAUTH_PROVIDER_DENIED' };
    }
    const code = typeof params?.code === 'string' ? params.code : '';
    if (!code) {
      return { returnTo, error: 'OAUTH_CODE_MISSING' };
    }

    let session;
    try {
      session = await oauthLogin(provider, code, {
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        state,
      });
    } catch (error) {
      return {
        returnTo,
        error: SAFE_CALLBACK_ERRORS.has(error?.code) ? error.code : 'OAUTH_LOGIN_FAILED',
      };
    }
    const ticket = randomToken();
    await store.set(
      `oauth:ticket:${ticket}`,
      JSON.stringify(session),
      'EX',
      TICKET_TTL_SECONDS,
    );
    return { returnTo, ticket, isNew: session.isNew };
  };

  const consumeTicket = async (ticket) => {
    if (typeof ticket !== 'string' || !ticket) {
      throw new AppError('로그인 ticket이 없습니다.', 400, 'OAUTH_TICKET_INVALID');
    }
    const stored = await store.getdel(`oauth:ticket:${ticket}`);
    const session = stored && parseStoredJson(stored);
    if (!session?.accessToken || !session?.refreshToken) {
      throw new AppError('로그인 ticket이 만료되었거나 이미 사용되었습니다.', 400, 'OAUTH_TICKET_INVALID');
    }
    return session;
  };

  return { createAuthorization, consumeCallback, consumeTicket };
};

module.exports = {
  STATE_TTL_SECONDS,
  TICKET_TTL_SECONDS,
  buildFrontendRedirect,
  createOAuthBrowserService,
};
