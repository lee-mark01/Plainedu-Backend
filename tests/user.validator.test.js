const { test } = require('node:test');
const assert = require('node:assert/strict');

const { updateProfileSchema } = require('../src/domains/user/user.validator');

test('프로필 수정은 학교만 선택하는 온보딩 요청을 허용한다', () => {
  const { value, error } = updateProfileSchema.validate({ school_id: 42 });
  assert.equal(error, undefined);
  assert.deepEqual(value, { school_id: 42 });
});

test('프로필 수정은 빈 요청과 잘못된 학교 id를 거부한다', () => {
  assert.ok(updateProfileSchema.validate({}).error);
  assert.ok(updateProfileSchema.validate({ school_id: 0 }).error);
});
