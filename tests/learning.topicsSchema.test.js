// 학습 주제 조회 SQL과 실제 스키마가 어긋나지 않는지 검증 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
//
// 2026-09-03 회귀: learning.repository의 주제 목록 쿼리가 Topics.level_number를
// 조회했는데 스키마에는 그 컬럼이 없어 GET /api/learning/topics가 항상 500이었다.
// 같은 종류(쿼리가 없는 컬럼을 참조)의 회귀를 다시 만들지 않기 위한 테스트다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readRepoFile = (...segments) =>
  fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8');

/**
 * db/schema.sql에서 Topics 테이블 정의를 뜯어 컬럼명과 인덱스명을 뽑는다.
 */
const parseTopicsTable = () => {
  const schema = readRepoFile('db', 'schema.sql');
  const block = schema.match(/CREATE TABLE IF NOT EXISTS Topics \(([\s\S]*?)\n\) ENGINE=/);
  assert.ok(block, 'db/schema.sql에서 Topics 테이블 정의를 찾지 못했다');

  const body = block[1];
  const reserved = /^(PRIMARY|INDEX|UNIQUE|CONSTRAINT|FOREIGN|KEY)$/i;

  const columns = new Set();
  for (const line of body.split('\n')) {
    const m = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*)\s+\S/);
    if (m && !reserved.test(m[1])) columns.add(m[1]);
  }

  const indexes = new Set([...body.matchAll(/INDEX\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]));

  return { columns, indexes };
};

/**
 * findAllTopicsWithProgress 본문에서 Topics 별칭(t.)으로 참조하는 컬럼을 뽑는다.
 */
const parseTopicColumnRefs = () => {
  const repo = readRepoFile('src', 'domains', 'learning', 'learning.repository.js');
  const start = repo.indexOf('const findAllTopicsWithProgress');
  const end = repo.indexOf('const findTopicById');
  assert.ok(start >= 0, 'learning.repository에서 findAllTopicsWithProgress를 찾지 못했다');
  assert.ok(end > start, 'learning.repository에서 findTopicById를 찾지 못했다');

  const fn = repo.slice(start, end);
  return new Set([...fn.matchAll(/\bt\.([a-z_][a-z0-9_]*)\b/g)].map((m) => m[1]));
};

test('주제 목록 쿼리가 참조하는 Topics 컬럼이 전부 스키마에 있다', () => {
  const { columns } = parseTopicsTable();
  const referenced = parseTopicColumnRefs();

  assert.ok(referenced.size > 0, 'Topics 컬럼 참조를 하나도 찾지 못했다 — 파서가 깨졌을 수 있다');

  const missing = [...referenced].filter((col) => !columns.has(col));
  assert.deepEqual(missing, [], `스키마에 없는 컬럼을 조회하고 있다: ${missing.join(', ')}`);
});

test('Topics에 level_number 컬럼과 idx_topics_level_sort 인덱스가 있다', () => {
  const { columns, indexes } = parseTopicsTable();

  assert.ok(columns.has('level_number'), 'Topics.level_number가 스키마에 없다');
  assert.ok(
    indexes.has('idx_topics_level_sort'),
    'idx_topics_level_sort 인덱스가 없다 — level 필터 조회가 풀스캔이 된다'
  );
});

test('level_number를 추가하는 마이그레이션이 존재한다', () => {
  // schema.sql만 고치고 마이그레이션을 빼먹으면 배포 DB에는 컬럼이 안 생긴다.
  const dir = path.join(__dirname, '..', 'db', 'migrations');
  const hasMigration = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .some((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('level_number'));

  assert.ok(hasMigration, 'db/migrations에 level_number를 추가하는 마이그레이션이 없다');
});
