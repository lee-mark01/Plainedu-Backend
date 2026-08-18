const crypto = require('crypto');
const AppError = require('../../errors/AppError');

const createMainQaService = ({ config, verifyPin, repository, tokenTools, randomUUID = crypto.randomUUID, clock = () => new Date() }) => ({
  async login(pin, { ipAddress, userAgent }) {
    if (!config.enabled) {
      throw new AppError('요청한 경로를 찾을 수 없습니다.', 404, 'QA_AUTH_DISABLED');
    }
    if (!config.pinHash || !(await verifyPin(pin, config.pinHash))) {
      throw new AppError('QA PIN을 확인해주세요.', 401, 'QA_PIN_INVALID');
    }

    const user = await repository.findUserByEmail(config.userEmail);
    if (!user) {
      throw new AppError('QA 데이터가 준비되지 않았습니다.', 503, 'QA_DATA_NOT_READY');
    }

    const accessToken = tokenTools.signAccessToken({ userId: user.id, role: user.role });
    const refreshToken = tokenTools.generateRefreshToken();
    const now = clock();
    const expiresAt = new Date(now.getTime() + config.sessionTtlHours * 60 * 60 * 1000);

    await repository.saveRefreshToken({
      userId: user.id,
      tokenHash: tokenTools.hashToken(refreshToken),
      familyId: randomUUID(),
      ipAddress,
      userAgent,
      expiresAt,
      absoluteExpiresAt: expiresAt,
    });

    return { accessToken, refreshToken, user };
  },
});

module.exports = { createMainQaService };
