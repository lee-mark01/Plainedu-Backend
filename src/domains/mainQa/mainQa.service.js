const crypto = require('crypto');
const AppError = require('../../errors/AppError');

// persona -> 이메일. Joi가 이미 화이트리스트로 막지만 여기서 한 번 더 막는다 —
// 미들웨어 없이 라우트를 연결하는 실수를 대비해 enabled를 두 번 확인하는 것과 같은 이유다.
// persona를 생략하면 기본 계정(팀장)이다.
const resolveEmail = (config, persona) => {
  if (!persona) return config.userEmail;
  const email = config.personas?.[persona];
  if (!email) {
    throw new AppError('알 수 없는 QA 계정입니다.', 400, 'QA_PERSONA_UNKNOWN');
  }
  return email;
};

const createMainQaService = ({ config, verifyPin, repository, tokenTools, randomUUID = crypto.randomUUID, clock = () => new Date() }) => ({
  async login(pin, { ipAddress, userAgent, persona } = {}) {
    if (!config.enabled) {
      throw new AppError('요청한 경로를 찾을 수 없습니다.', 404, 'QA_AUTH_DISABLED');
    }
    if (!config.pinHash || !(await verifyPin(pin, config.pinHash))) {
      throw new AppError('QA PIN을 확인해주세요.', 401, 'QA_PIN_INVALID');
    }

    const email = resolveEmail(config, persona);
    const user = await repository.findUserByEmail(email);
    if (!user) {
      // 시드가 아직 안 돌았거나 persona가 가리키는 계정이 시드에 없다.
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
