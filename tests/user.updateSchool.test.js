// 학교를 바꾸면 기존 인증이 함께 무효화되는지 — 이게 깨지면 A대 인증 상태로 B대 소속이 된다.
// trading.executeFill.test.js와 같은 방식: 실제 dev DB에서 트랜잭션 안으로만 쓰고 항상 rollback.
require('dotenv').config();
const { test, after } = require('node:test');
const assert = require('node:assert/strict');

const pool = require('../src/config/db');
after(() => pool.end());

const userRepository = require('../src/domains/user/user.repository');

const TEST_USER_ID = 5; // db/seeds/seed-users.js가 만드는 더미 유저

test('학교를 바꾸면 school_is_verified가 함께 꺼진다', async () => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[school]] = await conn.query('SELECT id FROM schools LIMIT 1');
    assert.ok(school, 'schools 테이블이 비어있다 — 커리어넷 동기화 먼저 필요');

    // 인증된 상태에서 출발
    await conn.query('UPDATE Users SET school_is_verified = TRUE WHERE id = ?', [TEST_USER_ID]);

    await userRepository.updateSchool(TEST_USER_ID, school.id, conn);

    const [[user]] = await conn.query(
      'SELECT school_id, school_is_verified FROM Users WHERE id = ?',
      [TEST_USER_ID]
    );
    assert.equal(user.school_id, school.id);
    assert.equal(Boolean(user.school_is_verified), false, '학교가 바뀌었으면 인증은 무효여야 한다');
  } finally {
    await conn.rollback().catch(() => {});
    conn.release();
  }
});
