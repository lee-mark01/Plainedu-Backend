const crypto = require('crypto');
const AppError = require('../../errors/AppError');

const createQaSessionService = ({
  config,
  repository,
  firebaseAdmin,
  verifyPin,
  seedFixtures,
  withTransaction,
  randomUUID = crypto.randomUUID,
  clock = () => new Date(),
}) => {
  const createSession = async (pin, { ipAddress, userAgent } = {}) => {
    if (!config.enabled) {
      throw new AppError('요청한 경로를 찾을 수 없습니다.', 404, 'QA_AUTH_DISABLED');
    }
    if (!(await verifyPin(pin, config.pinHash))) {
      throw new AppError('QA PIN을 확인해주세요.', 401, 'QA_PIN_INVALID');
    }

    const qaSessionId = randomUUID();
    const firebaseUid = `qa_${qaSessionId}`;
    const now = clock();
    const expiresAt = new Date(now.getTime() + config.sessionTtlHours * 60 * 60 * 1000);

    const fixture = await withTransaction(async (executor) => {
      await repository.createSession(executor, {
        id: qaSessionId,
        firebaseUid,
        expiresAt,
        ipAddress,
        userAgent,
      });
      const seeded = await seedFixtures(executor, { qaSessionId, firebaseUid, now });
      await repository.setRootUser(executor, {
        sessionId: qaSessionId,
        rootUserId: seeded.rootUserId,
      });
      return seeded;
    });

    try {
      await firebaseAdmin.ensureQaUser({
        uid: firebaseUid,
        email: fixture.email,
        displayName: fixture.displayName,
      });
      const customToken = await firebaseAdmin.createCustomToken(firebaseUid, { qaSessionId });
      return { customToken, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      await repository.deleteSession(qaSessionId).catch(() => {});
      await firebaseAdmin.deleteQaIdentity(firebaseUid).catch(() => {});
      throw error;
    }
  };

  return { createSession };
};

module.exports = { createQaSessionService };
