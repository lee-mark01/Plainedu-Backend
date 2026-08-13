// 500대에서 DB 에러 원문이 새지 않는지만 확인한다. 미들웨어를 직접 부르므로 서버·DB가 필요 없다.
const test = require('node:test');
const assert = require('node:assert');
const errorHandler = require('../src/middlewares/errorHandler');

test('500: mysql 에러의 message·code가 클라이언트로 새지 않는다', () => {
  const err = Object.assign(new Error("Duplicate entry 'a@b.com' for key 'Users.uq_users_email'"), {
    code: 'ER_DUP_ENTRY',
  });
  let body;
  const res = { status: () => res, json: (b) => { body = b; } };

  const log = console.error;
  console.error = () => {};
  try {
    errorHandler(err, { method: 'POST', originalUrl: '/api/test' }, res, () => {});
  } finally {
    console.error = log;
  }

  assert.deepStrictEqual(body, { success: false, message: '서버 내부 오류가 발생했습니다.' });
});
