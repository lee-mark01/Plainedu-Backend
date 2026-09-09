// 퀴즈 응시 회차 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const { toResults } = require('../src/domains/learning/quizAttempt.service');
const { quizResultsQuerySchema } = require('../src/domains/learning/learning.validator');

test('이력 응답은 저장된 스냅샷을 숫자로 맞춰 내려준다', () => {
  const results = toResults([
    {
      attempt_id: 12, topic_id: 3, topic_title: '캔들차트 읽는 법',
      correct_count: '2', total_quiz_count: '3', score: '67',
      completed_at: '2026-09-09T05:12:00.000Z',
    },
  ]);

  assert.strictEqual(results[0].correct_count, 2);
  assert.strictEqual(results[0].total_quiz_count, 3);
  assert.strictEqual(results[0].score, 67);
  // 주제명을 조인해 함께 준다 — 프론트가 목록마다 주제를 다시 조회하지 않도록.
  assert.equal(results[0].topic_title, '캔들차트 읽는 법');
});

test('페이지네이션 기본값과 상한', () => {
  const { value, error } = quizResultsQuerySchema.validate({});
  assert.equal(error, undefined);
  assert.equal(value.page, 1);
  assert.equal(value.limit, 20);
  assert.ok(quizResultsQuerySchema.validate({ limit: 100 }).error);
  assert.ok(quizResultsQuerySchema.validate({ page: 0 }).error);
});

test('완료된 회차만, 최신순으로 조회한다', () => {
  // 진행 중인 회차가 섞이면 점수 0점짜리 미완료 기록이 이력에 뜬다.
  const source = read('src/domains/learning/quizAttempt.repository.js');

  assert.match(source, /status = 'COMPLETED'/);
  assert.match(source, /ORDER BY qa\.completed_at DESC/);
});

test('진행 중 회차를 잠근 뒤 판단한다', () => {
  // 문제 두 개를 거의 동시에 제출하면 두 요청이 모두 "회차 없음"을 보고 각자 만들어
  // 한 응시가 두 회차로 쪼개진다.
  const repository = read('src/domains/learning/quizAttempt.repository.js');
  const service = read('src/domains/learning/learning.service.js');

  assert.match(repository, /FOR UPDATE/);
  // 답안 저장이 트랜잭션 안에서 회차 조회·생성과 함께 일어나야 한다.
  const start = service.indexOf('const submitQuizAnswer');
  const body = service.slice(start, service.indexOf('const closeCurrentAttempt'));
  assert.match(body, /withTransaction/);
  assert.match(body, /findOpenAttemptForUpdate/);
  assert.match(body, /insertQuizLog\([^)]*attemptId, conn\)/);
});

test('회차 정답 수는 문제 단위로 중복을 제거한다', () => {
  // 회차 안에서 같은 문제를 두 번 맞히면 정답 수가 문제 수를 넘을 수 있다.
  const source = read('src/domains/learning/quizAttempt.repository.js');
  assert.match(source, /COUNT\(DISTINCT CASE WHEN is_correct = TRUE THEN quiz_id END\)/);
});

test('완료를 두 번 눌러도 첫 결과가 유지된다', () => {
  // status 조건이 없으면 두 번째 호출이 점수를 덮어쓴다.
  const source = read('src/domains/learning/quizAttempt.repository.js');
  assert.match(source, /WHERE id = \? AND status = 'IN_PROGRESS'/);
});

test('회차 분모는 주제의 전체 문제 수다', () => {
  // 그 회차에 푼 문제 수를 분모로 쓰면 회차마다 분모가 달라 비교할 수 없고,
  // 한 문제만 풀고 완료해도 100점이 된다.
  const source = read('src/domains/learning/learning.service.js');
  const start = source.indexOf('const closeCurrentAttempt');
  const body = source.slice(start, start + 1200);

  assert.match(body, /correctCount \/ totalQuizCount/);
  assert.match(source, /closeCurrentAttempt\(userId, topicId, summary\.total\)/);
});

test('완료 응답이 누적과 회차 값을 함께 준다', () => {
  // 기존 필드(누적)는 이미 배포된 계약이라 그대로 두고, 회차 값을 additive로 추가했다.
  const source = read('src/domains/learning/learning.service.js');
  const start = source.indexOf('const completeQuizSession');
  const body = source.slice(start, source.indexOf('const closeCurrentAttempt'));

  assert.match(body, /correctCount: summary\.correct/);   // 누적 유지
  assert.match(body, /attempt,/);                          // 회차 추가
});

test('OpenAPI가 이력과 회차 계약을 문서화한다', () => {
  const spec = yaml.load(read('docs/openapi.yaml'));

  assert.ok(spec.paths['/api/learning/quiz-results']?.get);
  assert.ok(spec.components.schemas.QuizResult);

  // 완료 응답의 attempt는 null 가능해야 한다 — 답안 없이 완료를 부를 수 있다.
  const attempt = spec.components.schemas.QuizSessionResult.properties.attempt;
  assert.ok(attempt, '완료 응답에 attempt가 없다');
  assert.equal(attempt.nullable, true);

  // 이력 항목의 분모가 주제 전체 문제 수라는 게 계약이다.
  const total = spec.components.schemas.QuizResult.properties.total_quiz_count;
  assert.match(total.description, /전체 문제 수/);
});
