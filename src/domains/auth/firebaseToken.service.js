const crypto = require('crypto');
const AppError = require('../../errors/AppError');

const SLIDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ABSOLUTE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const createFirebaseTokenService = ({
  repository,
  accountService,
  tokenTools,
  randomUUID = crypto.randomUUID,
  clock = () => new Date(),
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

    const qaSessionId = decodedToken?.qaSessionId;
    const qaExpiry = user.qa_session_id && user.qa_expires_at
      ? new Date(user.qa_expires_at)
      : null;
    const nowDate = clock();
    if (
      qaSessionId !== (user.qa_session_id || undefined)
      || (user.qa_session_id && (!qaExpiry || qaExpiry <= nowDate))
    ) {
      throw new AppError('유효하지 않은 QA 세션입니다.', 401, 'QA_SESSION_INVALID');
    }

    await accountService.getOrCreateIndividualAccount(user.id);

    const payload = { userId: user.id, role: user.role };
    if (user.qa_session_id) payload.qaSessionId = user.qa_session_id;
    const accessToken = tokenTools.signAccessToken(payload, qaExpiry);
    const refreshToken = tokenTools.generateRefreshToken();
    const now = nowDate.getTime();
    const slidingExpiry = new Date(now + SLIDING_TTL_MS);
    const absoluteExpiry = new Date(now + ABSOLUTE_TTL_MS);

    await repository.saveRefreshToken({
      userId: user.id,
      tokenHash: tokenTools.hashToken(refreshToken),
      familyId: randomUUID(),
      ipAddress,
      userAgent,
      expiresAt: qaExpiry && qaExpiry < slidingExpiry ? qaExpiry : slidingExpiry,
      absoluteExpiresAt: qaExpiry && qaExpiry < absoluteExpiry ? qaExpiry : absoluteExpiry,
    });

    return { accessToken, refreshToken, user, isNew };
  };

  return { exchange };
};

module.exports = { createFirebaseTokenService };
