// QA 로그인 화이트리스트와 시드가 어긋나지 않는지 검증한다 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
//
// 이 테스트가 있는 이유: persona가 가리키는 계정을 시드가 만들지 않으면 프론트는 503
// QA_DATA_NOT_READY만 받는다. 두 파일이 따로 있어 한쪽만 고치기 쉬운데, 어긋나도
// 배포는 성공하고 QA 단계에서야 드러난다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const { QA_PERSONAS, QA_PERSONA_KEYS, DEFAULT_PERSONA } = require('../src/domains/mainQa/mainQa.config');
const { createMainQaCleanup, QA_USER_EMAILS } = require('../db/seeds/cleanup-main-qa');

const seedDemo = read('db/seeds/seed-demo.js');
const seedFeatures = read('db/seeds/seed-qa-features.js');

test('persona가 가리키는 계정을 시드가 모두 만든다', () => {
  // 하나라도 빠지면 그 persona로 로그인할 때 503이다.
  for (const [key, email] of Object.entries(QA_PERSONAS)) {
    assert.ok(seedDemo.includes(`'${email}'`), `${key}(${email})를 seed-demo가 만들지 않는다`);
  }
});

test('persona 계정은 전부 cleanup 대상이다', () => {
  // 빠지면 그 계정만 지워지지 않고 남아 다음 배포에 옛 데이터가 섞인다.
  for (const [key, email] of Object.entries(QA_PERSONAS)) {
    assert.ok(QA_USER_EMAILS.includes(email), `${key}(${email})가 cleanup 목록에 없다`);
  }
});

test('cleanup의 QA 이메일 가드가 persona 계정을 전부 허용한다', () => {
  // 가드는 실계정 삭제를 막는 장치다. persona 계정이 형식에서 벗어나면 cleanup이 아예 못 돈다.
  assert.doesNotThrow(() => createMainQaCleanup({ pool: {}, qaUserEmails: Object.values(QA_PERSONAS) }));
  // 가드가 살아 있는지도 같이 확인한다 — 통과만 보면 가드를 지워도 테스트가 녹색이다.
  assert.throws(() => createMainQaCleanup({ pool: {}, qaUserEmails: ['real.user@gmail.com'] }));
});

test('기본 persona는 화이트리스트에 있는 키다', () => {
  assert.ok(QA_PERSONA_KEYS.includes(DEFAULT_PERSONA));
  assert.equal(QA_PERSONAS[DEFAULT_PERSONA], 'dummy.leader@test.com');
});

test('관리자 persona는 role=ADMIN으로 시드된다', () => {
  // 수동 UPDATE는 cleanup의 DELETE로 매 배포마다 날아간다. 시드가 role을 줘야 유지된다.
  const line = seedDemo.split('\n').find((l) => l.includes(QA_PERSONAS.admin)) || '';
  assert.match(line, /role: 'ADMIN'/, '관리자 계정에 role이 없다');

  // INSERT의 role이 하드코딩이면 위 정의가 무시된다.
  assert.doesNotMatch(seedDemo, /VALUES \(\?, \?, 'USER'/);
  assert.match(seedDemo, /role = VALUES\(role\)/, '재실행 시 role이 정의대로 맞춰지지 않는다');
});

test('두 시드가 관리자 계정을 같게 정의한다', () => {
  // seed-users.js와 seed-demo.js가 같은 이메일을 정의한다. 값이 다르면 나중에 돈 쪽이
  // 이겨서, 어느 스크립트를 돌렸는지에 따라 계정 상태가 달라진다.
  const pick = (source) => {
    const line = source.split('\n').find((l) => l.includes(QA_PERSONAS.admin)) || '';
    return {
      hasNoSchool: /school: null/.test(line),
      isNotVerified: /verified: false/.test(line),
      isAdmin: /role: 'ADMIN'/.test(line),
    };
  };
  const fromUsers = pick(read('db/seeds/seed-users.js'));
  assert.deepEqual(fromUsers, pick(seedDemo), '두 시드의 관리자 정의가 다르다');
  // 학교 없음 + 미인증 = 리그에 참여하지 않는 운영 계정.
  assert.deepEqual(fromUsers, { hasNoSchool: true, isNotVerified: true, isAdmin: true });
});

test('신규 기능 테이블에 전부 시드가 있다', () => {
  // 하나라도 비면 그 화면은 프론트가 구현해도 빈 상태로만 보인다.
  const tables = [
    'UserAgreements',
    'NotificationPrefs',
    'CommunityPosts',
    'CommunityComments',
    'CommunityBlocks',
    'CommunityReports',
    'UserRestrictions',
    'RestrictionAppeals',
    'TeamJoinRequests',
    'QuizAttempts',
    'StockAlerts',
  ];
  for (const table of tables) {
    assert.ok(seedFeatures.includes(table), `${table} 시드가 없다`);
  }
  // 휴대폰은 Users의 컬럼이라 테이블 이름으로 잡히지 않는다.
  assert.match(seedFeatures, /phone_verified_at/);
});

test('시드 순서가 보장된다', () => {
  // cleanup이 계정을 지우면 FK CASCADE로 기능 데이터도 사라진다.
  // seed-qa-features가 계정 재생성보다 먼저 돌면 계정을 못 찾고 전부 건너뛴다.
  const pipeline = read('db/seeds/seed-main-qa.js');
  const order = ['cleanup-main-qa.js', 'seed-demo.js', 'seed-qa-features.js'].map((f) =>
    pipeline.indexOf(`run('${f}')`)
  );
  assert.ok(order.every((i) => i >= 0), '파이프라인에 빠진 스크립트가 있다');
  assert.deepEqual([...order].sort((a, b) => a - b), order, '실행 순서가 틀렸다');
});

test('CD가 마이그레이션과 시드를 모두 돌린다', () => {
  const deploy = read('.github/workflows/deploy.yml');
  for (const script of ['npm run migrate', 'npm run seed:learning', 'npm run seed:main-qa']) {
    assert.ok(deploy.includes(script), `CD에 ${script}가 없다`);
  }
  // 퀴즈 이력은 Topics를 참조한다 — seed:learning이 seed:main-qa보다 먼저여야 한다.
  assert.ok(deploy.indexOf('npm run seed:learning') < deploy.indexOf('npm run seed:main-qa'));
  // seed:stocks는 외부 API(Twelve Data)를 호출하므로 배포마다 돌리지 않는다.
  assert.doesNotMatch(deploy, /npm run seed:stocks/);
});

test('시드가 재실행에 안전한 문장만 쓴다', () => {
  // 배포마다 도는 스크립트다. 무조건 INSERT면 재실행마다 신고·제한이 쌓인다.
  const inserts = seedFeatures
    .split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /INSERT INTO/.test(l) && !/INSERT IGNORE/.test(l));

  for (const [lineNo, line] of inserts) {
    // findOrInsert에 넘기는 INSERT는 호출부가 존재 확인을 하고, 나머지는 ON DUPLICATE KEY가 받는다.
    const block = seedFeatures.slice(seedFeatures.indexOf(line));
    assert.ok(
      /ON DUPLICATE KEY UPDATE/.test(block.slice(0, 400)) || /findOrInsert\(/.test(seedFeatures),
      `${lineNo}행의 INSERT에 재실행 보호가 없다`
    );
  }
  assert.match(seedFeatures, /findOrInsert/);
});
