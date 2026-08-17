const cron = require('node-cron');
const qaRepository = require('../domains/qa/qa.repository');
const { getQaConfig } = require('../config/qa');
const { getQaFirebaseAdmin } = require('../domains/qa/firebaseAdmin');

const createQaCleanupJob = ({ repository, firebaseAdmin, clock = () => new Date(), logger = console, retentionHours = 24 }) => ({
  async runOnce() {
    const now = clock();
    const sessions = await repository.claimExpiredSessions({
      expiresBefore: new Date(now.getTime() - retentionHours * 3_600_000),
      staleBefore: new Date(now.getTime() - 15 * 60_000),
      limit: 50,
    });
    let deleted = 0;
    let failed = 0;
    for (const session of sessions) {
      try {
        await firebaseAdmin.deleteQaIdentity(session.firebaseUid);
        await repository.deleteSession(session.id);
        deleted += 1;
      } catch (error) {
        failed += 1;
        await repository.releaseCleanupClaim(session.id);
        logger.error('[qaSessionCleanup] cleanup failed', { sessionId: session.id, error: error.message });
      }
    }
    const result = { claimed: sessions.length, deleted, failed };
    logger.info('[qaSessionCleanup] cleanup complete', result);
    return result;
  },
});

let task;
const shouldStartQaCleanup = (config, serviceAccountJson = process.env.QA_FIREBASE_SERVICE_ACCOUNT_JSON) =>
  Boolean(config.firebaseProjectId && serviceAccountJson);

const start = () => {
  const config = getQaConfig();
  if (!shouldStartQaCleanup(config) || task) return;
  const job = createQaCleanupJob({
    repository: qaRepository,
    firebaseAdmin: getQaFirebaseAdmin(config),
    retentionHours: config.retentionHours,
  });
  task = cron.schedule('17 * * * *', () => job.runOnce().catch((error) => {
    console.error('[qaSessionCleanup] job failed', { error: error.message });
  }));
};

const stop = () => {
  task?.stop();
  task = undefined;
};

module.exports = { createQaCleanupJob, shouldStartQaCleanup, start, stop };
