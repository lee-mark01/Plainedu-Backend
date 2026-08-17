const AppError = require('../../errors/AppError');

const SLIDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const earlierDate = (left, right) => new Date(Math.min(new Date(left).getTime(), new Date(right).getTime()));

const createRefreshService = ({ repository, tokenTools, clock = () => new Date() }) => {
  const refresh = async (rawRefreshToken, { ipAddress, userAgent }) => {
    if (!rawRefreshToken) throw new AppError('리프레시 토큰이 없습니다.', 400);

    const tokenHash = tokenTools.hashToken(rawRefreshToken);
    const stored = await repository.findRefreshToken(tokenHash);
    if (!stored) throw new AppError('유효하지 않은 리프레시 토큰입니다.', 401, 'REFRESH_TOKEN_INVALID');

    if (stored.used) {
      await repository.deleteRefreshTokenFamily(stored.family_id);
      throw new AppError('비정상적인 토큰 사용이 감지되었습니다. 다시 로그인해주세요.', 401, 'TOKEN_REUSE_DETECTED');
    }

    const now = clock();
    if (new Date(stored.expires_at) < now) {
      await repository.deleteRefreshTokenFamily(stored.family_id);
      throw new AppError('리프레시 토큰이 만료되었습니다.', 401, 'REFRESH_TOKEN_EXPIRED');
    }

    const user = await repository.findUserById(stored.user_id);
    if (!user) throw new AppError('존재하지 않는 사용자입니다.', 401);

    const qaExpiry = user.qa_session_id && user.qa_expires_at
      ? new Date(user.qa_expires_at)
      : null;
    if (user.qa_session_id && (!qaExpiry || qaExpiry <= now)) {
      await repository.deleteRefreshTokenFamily(stored.family_id);
      throw new AppError('QA 세션이 만료되었습니다.', 401, 'QA_SESSION_EXPIRED');
    }

    const payload = { userId: user.id, role: user.role };
    if (user.qa_session_id) payload.qaSessionId = user.qa_session_id;
    const accessToken = tokenTools.signAccessToken(payload);
    const newRefreshToken = tokenTools.generateRefreshToken();
    const slidingExpiry = new Date(now.getTime() + SLIDING_TTL_MS);
    const expiresAt = qaExpiry ? earlierDate(slidingExpiry, qaExpiry) : slidingExpiry;
    const absoluteExpiresAt = qaExpiry
      ? earlierDate(stored.absolute_expires_at, qaExpiry)
      : stored.absolute_expires_at;

    await repository.rotateRefreshToken({
      oldHash: tokenHash,
      userId: user.id,
      newHash: tokenTools.hashToken(newRefreshToken),
      familyId: stored.family_id,
      ipAddress,
      userAgent,
      expiresAt,
      absoluteExpiresAt,
    });

    return { accessToken, refreshToken: newRefreshToken };
  };

  return { refresh };
};

module.exports = { createRefreshService };
