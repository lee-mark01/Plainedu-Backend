// db.withTransaction 단위 테스트 — getConnection을 가짜로 갈아끼워 DB 없이 검증. `node --test tests/`로 실행.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');

// 호출 순서를 기록하는 가짜 커넥션
const fakeConn = (log) => ({
  beginTransaction: async () => log.push('begin'),
  commit: async () => log.push('commit'),
  rollback: async () => log.push('rollback'),
  release: () => log.push('release'),
});

const withFakePool = async (log, fn) => {
  const original = db.getConnection;
  db.getConnection = async () => fakeConn(log);
  try {
    return await fn();
  } finally {
    db.getConnection = original;
  }
};

test('정상 종료: begin → commit → release, 콜백 반환값을 그대로 넘긴다', async () => {
  const log = [];
  const result = await withFakePool(log, () => db.withTransaction(async (conn) => {
    assert.ok(conn, 'conn이 콜백에 전달돼야 한다');
    return 42;
  }));

  assert.equal(result, 42);
  assert.deepEqual(log, ['begin', 'commit', 'release']);
});

test('콜백이 던지면: rollback + release 후 에러를 다시 던진다', async () => {
  const log = [];
  await assert.rejects(
    () => withFakePool(log, () => db.withTransaction(async () => {
      throw new Error('boom');
    })),
    /boom/
  );

  assert.deepEqual(log, ['begin', 'rollback', 'release']);
});

test('rollback 자체가 실패해도 원래 에러가 전파되고 커넥션은 반납된다', async () => {
  const log = [];
  const original = db.getConnection;
  db.getConnection = async () => ({
    beginTransaction: async () => log.push('begin'),
    commit: async () => log.push('commit'),
    rollback: async () => { throw new Error('rollback 실패'); },
    release: () => log.push('release'),
  });

  try {
    await assert.rejects(
      () => db.withTransaction(async () => { throw new Error('원래 에러'); }),
      /원래 에러/
    );
    assert.deepEqual(log, ['begin', 'release']);
  } finally {
    db.getConnection = original;
  }
});
