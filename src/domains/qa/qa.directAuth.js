const crypto = require('crypto');
const authRepository = require('../auth/auth.repository');
const { signAccessToken, generateRefreshToken, hashToken } = require('../../utils/jwt');

const createQaDirectAuth = ({
  repository,
  tokenTools,
  randomUUID = crypto.randomUUID,
}) => ({
  async issue({ rootUserId, qaSessionId, expiresAt, email, displayName, ipAddress, userAgent }) {
    const accessToken = tokenTools.signAccessToken({
      userId: rootUserId,
      role: 'USER',
      qaSessionId,
    }, expiresAt);
    const refreshToken = tokenTools.generateRefreshToken();

    await repository.saveRefreshToken({
      userId: rootUserId,
      tokenHash: tokenTools.hashToken(refreshToken),
      familyId: randomUUID(),
      ipAddress,
      userAgent,
      expiresAt,
      absoluteExpiresAt: expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: rootUserId,
        email,
        nickname: displayName,
        role: 'USER',
        qa_session_id: qaSessionId,
      },
    };
  },
});

module.exports = createQaDirectAuth({
  repository: authRepository,
  tokenTools: { signAccessToken, generateRefreshToken, hashToken },
});
module.exports.createQaDirectAuth = createQaDirectAuth;
