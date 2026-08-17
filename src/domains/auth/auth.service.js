const crypto = require('crypto');
const authRepository = require('./auth.repository');
const AppError = require('../../errors/AppError');
const { signAccessToken, generateRefreshToken, hashToken } = require('../../utils/jwt');
const accountService = require('../account/account.service');
const { createRefreshService } = require('./refresh.service');

const providers = {
  kakao: require('./providers/kakao'),
  naver: require('./providers/naver'),
  google: require('./providers/google'),
};

const PROVIDER_LABEL = { kakao: '카카오', naver: '네이버', google: '구글', local: '이메일' };
const labelOf = (p) => PROVIDER_LABEL[p] || p;

const SLIDING_TTL_MS  = 7  * 24 * 60 * 60 * 1000;  // 7일 (미사용 시 만료)
const ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000;  // 90일 (절대 만료)

const oauthLogin = async (provider, code, { ipAddress, userAgent, state }) => {
  if (!code) throw new AppError('인가 코드가 없습니다.', 400);

  const handler = providers[provider];
  if (!handler) throw new AppError('지원하지 않는 로그인 방식입니다.', 400);

  const providerToken = await handler.exchangeCode(code, { state });
  const { snsId, email, nickname } = await handler.getProfile(providerToken);

  let user = await authRepository.findUserBySnsId(provider, snsId);
  let isNew = false;

  if (!user) {
    const isRealEmail = email && !email.endsWith('@noemail.local');
    if (isRealEmail) {
      const byEmail = await authRepository.findUserByEmail(email);
      if (byEmail && byEmail.provider !== provider) {
        throw new AppError(
          `이미 ${labelOf(byEmail.provider)} 계정으로 가입되어 있습니다. ${labelOf(byEmail.provider)}로 로그인해주세요.`,
          409,
          'PROVIDER_CONFLICT'
        );
      }
    }
    const userId = await authRepository.createOauthUser({ email, nickname, provider, snsId });
    user = await authRepository.findUserById(userId);
    isNew = true;
  }

  // 개인 계좌는 가입 시점뿐 아니라 매 로그인마다 보장한다 (이미 있으면 조회 한 번뿐이라 저렴하고,
  // 가입 직후 계좌 생성이 실패해도 다음 로그인에서 복구됨)
  await accountService.getOrCreateIndividualAccount(user.id);

  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const refreshToken = generateRefreshToken();
  const now = Date.now();

  await authRepository.saveRefreshToken({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    familyId: crypto.randomUUID(),
    ipAddress,
    userAgent,
    expiresAt: new Date(now + SLIDING_TTL_MS),
    absoluteExpiresAt: new Date(now + ABSOLUTE_TTL_MS),
  });

  return { accessToken, refreshToken, user, isNew };
};

const refresh = createRefreshService({
  repository: authRepository,
  tokenTools: { signAccessToken, generateRefreshToken, hashToken },
}).refresh;

const logout = async (rawRefreshToken) => {
  if (!rawRefreshToken) throw new AppError('리프레시 토큰이 없습니다.', 400);

  const tokenHash = hashToken(rawRefreshToken);
  const stored = await authRepository.findRefreshToken(tokenHash);

  if (stored) {
    await authRepository.deleteRefreshTokenFamily(stored.family_id);
  }
};

module.exports = { oauthLogin, refresh, logout };
