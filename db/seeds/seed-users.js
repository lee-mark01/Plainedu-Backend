// 팀원 테스트용 더미 유저 시딩 스크립트
//
// 사용법:
//   npm run seed:users
//
// 학교 인증 여부/소속 학교가 다른 더미 유저를 만들어
// 팀 생성·가입·검색 등 학교 인증이 필요한 기능을 바로 테스트할 수 있게 해줍니다.
// 이미 존재하는 이메일은 덮어쓰기(업데이트)되므로 여러 번 실행해도 안전합니다.
require('dotenv').config();

const pool = require('../../src/config/db');

const DUMMY_SCHOOLS = [
  { schoolName: '테스트고등학교', region: '테스트' },
  { schoolName: '테스트대학교', region: '테스트' },
];

const DUMMY_USERS = [
  { email: 'dummy.verified1@test.com', nickname: '더미인증유저1', school: '테스트고등학교', verified: true },
  { email: 'dummy.verified2@test.com', nickname: '더미인증유저2', school: '테스트고등학교', verified: true },
  { email: 'dummy.otherschool@test.com', nickname: '더미다른학교유저', school: '테스트대학교', verified: true },
  { email: 'dummy.unverified@test.com', nickname: '더미미인증유저', school: '테스트고등학교', verified: false },
  { email: 'dummy.noschool@test.com', nickname: '더미학교없음유저', school: null, verified: false },
  { email: 'dummy.admin@test.com', nickname: '더미관리자', school: '테스트고등학교', verified: true, role: 'ADMIN' },
];

// 더미 학교가 없으면 생성하고 id를 반환 (있으면 기존 것 재사용)
const upsertSchool = async ({ schoolName, region }) => {
  await pool.query('INSERT IGNORE INTO schools (school_name, region) VALUES (?, ?)', [schoolName, region]);
  const [rows] = await pool.query('SELECT id FROM schools WHERE school_name = ? AND region = ?', [schoolName, region]);
  return rows[0].id;
};

(async () => {
  try {
    const schoolIds = {};
    for (const school of DUMMY_SCHOOLS) {
      schoolIds[school.schoolName] = await upsertSchool(school);
    }

    for (const u of DUMMY_USERS) {
      const school_id = u.school ? schoolIds[u.school] : null;
      await pool.query(
        `INSERT INTO Users (email, nickname, role, provider, school_id, school_is_verified)
         VALUES (?, ?, ?, 'local', ?, ?)
         ON DUPLICATE KEY UPDATE
           nickname = VALUES(nickname),
           role = VALUES(role),
           school_id = VALUES(school_id),
           school_is_verified = VALUES(school_is_verified)`,
        [u.email, u.nickname, u.role || 'USER', school_id, u.verified ? 1 : 0]
      );
    }

    console.log('더미 유저 시딩 완료');
    console.table(
      DUMMY_USERS.map((u) => ({
        email: u.email,
        nickname: u.nickname,
        school: u.school || '(없음)',
        school_is_verified: u.verified,
        role: u.role || 'USER',
      }))
    );
    process.exitCode = 0;
  } catch (err) {
    console.error('더미 유저 시딩 실패:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
