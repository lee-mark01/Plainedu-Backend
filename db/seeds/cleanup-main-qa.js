require('dotenv').config();

const defaultPool = require('../../src/config/db');

const QA_USER_EMAILS = Object.freeze([
  'dummy.leader@test.com',
  'dummy.member1@test.com',
  'dummy.member2@test.com',
  'dummy.solo1@test.com',
  'dummy.solo2@test.com',
  'dummy.univ1@test.com',
  'dummy.univ2@test.com',
  'dummy.unverified@test.com',
  'dummy.noschool@test.com',
  'dummy.admin@test.com',
]);
const QA_SCHOOL_NAMES = Object.freeze(['테스트고등학교', '테스트대학교']);

const assertQaEmails = (emails) => {
  if (!emails.length || emails.some((email) => !/^dummy\.[a-z0-9]+@test\.com$/.test(email))) {
    throw new Error('QA 전용 이메일만 정리할 수 있습니다.');
  }
};

const createMainQaCleanup = ({ pool = defaultPool, qaUserEmails = QA_USER_EMAILS } = {}) => {
  assertQaEmails(qaUserEmails);
  return {
    async run() {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [users] = await connection.query('SELECT id FROM Users WHERE email IN (?) FOR UPDATE', [qaUserEmails]);
        const userIds = users.map(({ id }) => id);
        const [teams] = userIds.length
          ? await connection.query(
            'SELECT DISTINCT t.id FROM Teams t JOIN TeamMembers tm ON tm.team_id = t.id WHERE tm.user_id IN (?) FOR UPDATE',
            [userIds]
          )
          : [[]];
        const teamIds = teams.map(({ id }) => id);
        const [schools] = await connection.query(
          "SELECT id FROM schools WHERE school_name IN (?) AND region = '테스트' FOR UPDATE",
          [QA_SCHOOL_NAMES]
        );
        const schoolIds = schools.map(({ id }) => id);

        if (teamIds.length) {
          await connection.query("DELETE FROM DailyRankings WHERE target_type = 'TEAM' AND target_id IN (?)", [teamIds]);
        }
        if (userIds.length) {
          await connection.query("DELETE FROM DailyRankings WHERE target_type = 'USER' AND target_id IN (?)", [userIds]);
        }
        if (schoolIds.length) {
          await connection.query("DELETE FROM DailyRankings WHERE target_type = 'SCHOOL' AND target_id IN (?)", [schoolIds]);
        }
        if (teamIds.length) await connection.query('DELETE FROM Teams WHERE id IN (?)', [teamIds]);
        await connection.query('DELETE FROM Users WHERE email IN (?)', [qaUserEmails]);
        await connection.commit();
        return { userIds, teamIds, schoolIds };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
  };
};

const runCli = async () => {
  try {
    const result = await createMainQaCleanup().run();
    console.log(`메인 QA 데이터 정리 완료: 사용자 ${result.userIds.length}명, 팀 ${result.teamIds.length}개`);
  } catch (error) {
    console.error('메인 QA 데이터 정리 실패:', error.message);
    process.exitCode = 1;
  } finally {
    await defaultPool.end();
  }
};

if (require.main === module) runCli();

module.exports = { createMainQaCleanup, QA_USER_EMAILS };
