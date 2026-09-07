// 추천 사용자·연관 검색어 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const { toResponse } = require('../src/domains/community/suggest.service');
const { toTerms } = require('../src/domains/stock/relatedTerms.service');
const { suggestedUsersSchema } = require('../src/domains/community/suggest.validator');
const { relatedTermsSchema } = require('../src/domains/stock/stock.validator');

test('추천 응답은 팔로우 상태와 추천 이유를 함께 담는다', () => {
  const users = toResponse([
    { user_id: 12, nickname: '인천인', shared_interests: '3', recent_post_count: '7' },
  ]);

  // 추천은 미팔로우만 담으므로 항상 false지만, 필드가 없으면 프론트가 undefined 분기를 따로 둬야 한다.
  assert.equal(users[0].is_following, false);
  // DECIMAL/COUNT가 문자열로 오는 경우가 있어 숫자로 맞춰 내린다.
  assert.strictEqual(users[0].shared_interests, 3);
  assert.strictEqual(users[0].recent_post_count, 7);
});

test('추천 쿼리가 본인·팔로우·차단을 제외한다', () => {
  // 셋 중 하나라도 빠지면 이미 팔로우한 사람이나 차단한 사람이 추천에 뜬다.
  const source = read('src/domains/community/suggest.repository.js');

  assert.match(source, /u\.id <> \?/, '본인 제외가 없다');
  assert.match(source, /NOT EXISTS \(\s*SELECT 1 FROM Follows/, '이미 팔로우 제외가 없다');
  assert.match(source, /blockFilter\('u\.id', viewer_id\)/, '차단 제외가 없다');
});

test('추천 쿼리는 근거 없는 사용자를 내보내지 않는다', () => {
  // 겹치는 관심사도 없고 최근 글도 없으면 추천할 이유가 하나도 없다.
  const source = read('src/domains/community/suggest.repository.js');
  assert.match(source, /HAVING shared_interests > 0 OR recent_post_count > 0/);
});

test('관심사 가중치가 활동량보다 크다', () => {
  // 활동량만 높은 사람은 아무에게나 추천되지만, 겹치는 관심 종목은 그 사람에게만 해당한다.
  const { INTEREST_WEIGHT } = require('../src/domains/community/suggest.repository');
  assert.ok(INTEREST_WEIGHT > 1);
});

test('연관 검색어는 후보 출처를 구분해 내려준다', () => {
  const related = toTerms([{ name: 'Microsoft', stock_code: 'MSFT', score: '12' }], 'related');
  const prefix = toTerms([{ name: 'Apple Inc', stock_code: 'AAPL', score: 0 }], 'prefix');

  assert.equal(related[0].matched_by, 'related');
  assert.equal(prefix[0].matched_by, 'prefix');
  // term은 화면에 그대로 띄울 문자열, stock_code는 종목 상세로 보내기 위한 값이다.
  assert.equal(related[0].term, 'Microsoft');
  assert.equal(related[0].stock_code, 'MSFT');
  assert.strictEqual(related[0].score, 12);
});

test('연관 검색어가 기준 종목 자신을 제외한다', () => {
  // 안 그러면 "AAPL 검색 → AAPL 추천"이 나온다.
  const source = read('src/domains/stock/relatedTerms.repository.js');
  const occurrences = source.match(/other\.stock_code <> seed\.stock_code/g) || [];
  assert.equal(occurrences.length, 2, '두 신호(글 태그·관심목록) 모두에서 제외해야 한다');
});

test('글 태그 가중치가 관심목록보다 크다', () => {
  const { TAG_WEIGHT, WATCHLIST_WEIGHT } = require('../src/domains/stock/relatedTerms.repository');
  assert.ok(TAG_WEIGHT > WATCHLIST_WEIGHT);
});

test('쿼리 파라미터 기본값과 상한', () => {
  assert.equal(suggestedUsersSchema.validate({}).value.limit, 5);
  assert.ok(suggestedUsersSchema.validate({ limit: 50 }).error);

  assert.ok(relatedTermsSchema.validate({}).error, 'q는 필수다');
  assert.equal(relatedTermsSchema.validate({ q: 'AAPL' }).value.limit, 8);
  assert.ok(relatedTermsSchema.validate({ q: 'AAPL', limit: 50 }).error);
});

test('고정 경로가 파라미터 경로보다 먼저 선언된다', () => {
  // 'suggested'가 :user_id로, 'related-terms'가 :symbol로 매칭되면 엉뚱한 핸들러로 간다.
  const community = read('src/domains/community/community.router.js');
  const stock = read('src/domains/stock/stock.router.js');

  assert.ok(community.indexOf("'/users/suggested'") < community.indexOf("'/users/:user_id/follow'"));
  assert.ok(stock.indexOf("'/related-terms'") < stock.indexOf("'/:symbol/quote'"));
});

test('추천 사용자는 인증을 요구하고 연관 검색어는 공개다', () => {
  // 추천은 "내" 관심사 기준이라 뷰어가 필요하고, 연관 검색어는 검색어만 있으면 된다.
  const community = read('src/domains/community/community.router.js');
  const stock = read('src/domains/stock/stock.router.js');

  assert.match(community, /router\.get\('\/users\/suggested', authenticate/);
  assert.doesNotMatch(stock, /router\.get\('\/related-terms', authenticate/);
});

test('OpenAPI가 두 계약을 문서화한다', () => {
  const spec = yaml.load(read('docs/openapi.yaml'));

  assert.ok(spec.paths['/api/community/users/suggested']?.get);
  assert.ok(spec.paths['/api/stocks/related-terms']?.get);

  const matchedBy = spec.paths['/api/stocks/related-terms'].get.responses['200']
    .content['application/json'].schema.allOf[1].properties.data.properties.terms.items.properties.matched_by;
  assert.deepEqual(matchedBy.enum, ['related', 'prefix']);
});
