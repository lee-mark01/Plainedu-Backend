const crypto = require('crypto');
const authRepository = require('./auth.repository');
const AppError = require('../../errors/AppError');
const { signAccessToken, generateRefreshToken, hashToken } = require('../../utils/jwt');

const providers = {
  kakao: require('./providers/kakao'),
};

const SLIDING_TTL_MS  = 7  * 24 * 60 * 60 * 1000;  // 7일 (미사용 시 만료)
const ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000;  // 90일 (절대 만료)

const oauthLogin = async (provider, code, { ipAddress, userAgent }) => {
  if (!code) throw new AppError('인가 코드가 없습니다.', 400);

  const handler = providers[provider];
  if (!handler) throw new AppError('지원하지 않는 로그인 방식입니다.', 400);

  const providerToken = await handler.exchangeCode(code);
  const { snsId, email, nickname } = await handler.getProfile(providerToken);

  let user = await authRepository.findUserBySnsId(provider, snsId);
  let isNew = false;

  if (!user) {
    const userId = await authRepository.createOauthUser({ email, nickname, provider, snsId });
    user = await authRepository.findUserById(userId);
    isNew = true;
  }

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

const refresh = async (rawRefreshToken, { ipAddress, userAgent }) => {
  if (!rawRefreshToken) throw new AppError('리프레시 토큰이 없습니다.', 400);

  const tokenHash = hashToken(rawRefreshToken);
  const stored = await authRepository.findRefreshToken(tokenHash);

  if (!stored) throw new AppError('유효하지 않은 리프레시 토큰입니다.', 401, 'REFRESH_TOKEN_INVALID');

  // Reuse Detection: 이미 소비된 토큰이 재사용됨 = 탈취 의심 → 계보 전체 삭제
  if (stored.used) {
    await authRepository.deleteRefreshTokenFamily(stored.family_id);
    throw new AppError('비정상적인 토큰 사용이 감지되었습니다. 다시 로그인해주세요.', 401, 'TOKEN_REUSE_DETECTED');
  }

  if (new Date(stored.expires_at) < new Date()) {
    await authRepository.deleteRefreshTokenFamily(stored.family_id);
    throw new AppError('리프레시 토큰이 만료되었습니다.', 401, 'REFRESH_TOKEN_EXPIRED');
  }

  const user = await authRepository.findUserById(stored.user_id);
  if (!user) throw new AppError('존재하지 않는 사용자입니다.', 401);

  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const newRefreshToken = generateRefreshToken();

  await authRepository.rotateRefreshToken({
    oldHash: tokenHash,
    userId: user.id,
    newHash: hashToken(newRefreshToken),
    familyId: stored.family_id,
    ipAddress,
    userAgent,
    expiresAt: new Date(Date.now() + SLIDING_TTL_MS),  // 슬라이딩: 7일 연장
    absoluteExpiresAt: stored.absolute_expires_at,      // 절대 만료: 최초 발급 기준 고정
  });

  return { accessToken, refreshToken: newRefreshToken };
};

const logout = async (rawRefreshToken) => {
  if (!rawRefreshToken) throw new AppError('리프레시 토큰이 없습니다.', 400);

  const tokenHash = hashToken(rawRefreshToken);
  const stored = await authRepository.findRefreshToken(tokenHash);

  if (stored) {
    await authRepository.deleteRefreshTokenFamily(stored.family_id);
  }
};

module.exports = { oauthLogin, refresh, logout };
