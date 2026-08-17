const pool = require('../../config/db');

const createQaRepository = (defaultExecutor = pool) => ({
  async createSession(executor, { id, firebaseUid, expiresAt }) {
    await executor.query(
      `INSERT INTO QaSessions (id, firebase_uid, expires_at)
       VALUES (?, ?, ?)`,
      [id, firebaseUid, expiresAt]
    );
  },

  async createRootFixture(executor, { qaSessionId, firebaseUid }) {
    const email = `qa-${firebaseUid}@qa.invalid`;
    const displayName = 'QA 테스터';
    const [result] = await executor.query(
      `INSERT INTO Users (email, nickname, role, provider, sns_id, qa_session_id, school_is_verified)
       VALUES (?, ?, 'USER', ?, ?, ?, TRUE)`,
      [email, displayName, 'firebase', firebaseUid, qaSessionId]
    );
    return { rootUserId: result.insertId, email, displayName };
  },

  async setRootUser(executor, { sessionId, rootUserId }) {
    await executor.query(
      'UPDATE QaSessions SET root_user_id = ? WHERE id = ?',
      [rootUserId, sessionId]
    );
  },

  async deleteSession(sessionId) {
    await defaultExecutor.query('DELETE FROM QaSessions WHERE id = ?', [sessionId]);
  },
});

module.exports = createQaRepository();
module.exports.createQaRepository = createQaRepository;
