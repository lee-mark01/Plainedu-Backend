const test = require('node:test');
const assert = require('node:assert/strict');

const { assertTeamSchoolEligibility } = require('../src/domains/team/team.service');

test('고등학교 사용자는 학교 선택 후 팀 온보딩을 계속할 수 있다', () => {
  assert.doesNotThrow(() => assertTeamSchoolEligibility(
    { school_id: 14, school_is_verified: false },
    { id: 14, school_group: 'HIGH_SCHOOL' }
  ));
});

test('대학교 사용자는 이메일 인증 전 팀 기능을 사용할 수 없다', () => {
  assert.throws(
    () => assertTeamSchoolEligibility(
      { school_id: 8, school_is_verified: false },
      { id: 8, school_group: 'UNIVERSITY' }
    ),
    (error) => error.status === 403
  );
});
