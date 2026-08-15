const crypto = require('crypto');
const AppError = require('../../errors/AppError');

const SLIDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const createFirebaseTokenService = ({
  repository,
  accountService,
  tokenTools,
  randomUUID = crypto.randomUUID,
}) => {
  const exchange = async (decodedToken, { ipAddress, userAgent }) => {
    const snsId = decodedToken?.uid;
    const email = decodedToken?.email?.trim().toLowerCase();
    const nickname = decodedToken?.name?.trim() || email?.split('@')[0] || 'Plain edu 사용자';

    if (!snsId) {
      throw new AppError('유효한 Firebase 사용자 식별자가 없습니다.', 401, 'FIREBASE_TOKEN_INVALID');
    }
    if (!email) {
      throw new AppError('로그인 계정의 이메일 제공 동의가 필요합니다.', 400, 'FIREBASE_EMAIL_REQUIRED');
    }

    let user = await repository.findUserBySnsId('firebase', snsId);
    let isNew = false;

    if (!user) {
      user = await repository.findUserByEmail(email);
    }

    if (!user) {
      const userId = await repository.createOauthUser({
        email,
        nickname,
        provider: 'firebase',
        snsId,
      });
      user = await repository.findUserById(userId);
      isNew = true;
    }

    await accountService.getOrCreateIndividualAccount(user.id);

    const accessToken = tokenTools.signAccessToken({ userId: user.id, role: user.role });
    const refreshToken = tokenTools.generateRefreshToken();
    const now = Date.now();

    await repository.saveRefreshToken({
      userId: user.id,
      tokenHash: tokenTools.hashToken(refreshToken),
      familyId: randomUUID(),
      ipAddress,
      userAgent,
      expiresAt: new Date(now + SLIDING_TTL_MS),
      absoluteExpiresAt: new Date(now + ABSOLUTE_TTL_MS),
    });

    return { accessToken, refreshToken, user, isNew };
  };

  return { exchange };
};

module.exports = { createFirebaseTokenService };
