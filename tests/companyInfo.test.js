// 기업 정보 응답 계약 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
//
// 데이터 소스가 붙지 않은 필드는 null로 내린다. 요청서가 지정한 계약이며,
// 값이 채워지기 시작해도 **응답 구조는 바뀌지 않아야** 프론트가 화면을 다시 안 만든다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const { toResponse } = require('../src/domains/stock/companyInfo.service');

const STOCK = { stock_code: 'AAPL', name: 'Apple Inc', market: 'NASDAQ', currency: 'USD', status: 'ACTIVE' };

// 소스가 붙기 전까지 null인 필드. 소스를 연동하면 이 목록에서 하나씩 빠진다.
const PENDING = ['description', 'region', 'sector', 'industry', 'industry_rank', 'market_cap', 'as_of'];

test('가진 데이터는 채우고 없는 것은 null로 내린다', () => {
  const data = toResponse(STOCK);

  assert.equal(data.stock_code, 'AAPL');
  assert.equal(data.name, 'Apple Inc');
  assert.equal(data.market, 'NASDAQ');
  assert.equal(data.currency, 'USD');

  for (const field of PENDING) {
    assert.strictEqual(data[field], null, `${field}는 소스 미연동이라 null이어야 한다`);
  }
});

test('빈 문자열이나 안내 문구를 값으로 넣지 않는다', () => {
  // 프론트가 그걸 실제 값으로 그린다 — 요청서가 null을 지정한 이유다.
  const data = toResponse(STOCK);

  for (const [key, value] of Object.entries(data)) {
    assert.notEqual(value, '', `${key}가 빈 문자열이다`);
    if (typeof value === 'string') {
      assert.doesNotMatch(value, /정보\s*없음|미제공|N\/A|없음/, `${key}에 안내 문구가 들어갔다`);
    }
  }
});

test('status 같은 내부 필드는 노출하지 않는다', () => {
  // Stocks.status는 운영용 값이라 종목 상세 화면에 나갈 이유가 없다.
  assert.equal(toResponse(STOCK).status, undefined);
});

test('없는 종목은 404로 거절한다', () => {
  // 빈 껍데기를 주면 프론트가 오타를 정상 종목으로 취급한다.
  const source = read('src/domains/stock/companyInfo.service.js');
  assert.match(source, /'STOCK_NOT_FOUND'/);
  assert.match(source, /if \(!stock\)/);
});

test('경로가 공개이고 심볼 검증을 거친다', () => {
  const router = read('src/domains/stock/stock.router.js');
  const line = router.split('\n').find((l) => l.includes("'/:symbol/company-info'")) || '';
  const block = router.slice(router.indexOf("'/:symbol/company-info'"));

  assert.ok(line || block, 'company-info 라우트가 없다');
  // 기업 정보는 사용자별로 달라지지 않아 인증이 필요 없다 (quote·chart와 동일).
  assert.doesNotMatch(block.slice(0, 200), /authenticate/);
  assert.match(block.slice(0, 200), /symbolParamsSchema/);
});

test('OpenAPI가 null 필드를 nullable로 명시한다', () => {
  // nullable이 빠지면 프론트가 타입을 생성할 때 null을 못 받는 타입이 나온다.
  const spec = yaml.load(read('docs/openapi.yaml'));
  assert.ok(spec.paths['/api/stocks/{symbol}/company-info']?.get);

  const props = spec.components.schemas.CompanyInfo.properties;
  for (const field of PENDING) {
    assert.ok(props[field], `스펙에 ${field}가 없다`);
    assert.equal(props[field].nullable, true, `${field}에 nullable이 없다`);
  }

  // 코드가 주는 키와 스펙이 정확히 같아야 한다 — 한쪽만 늘면 프론트가 어긋난다.
  assert.deepEqual(Object.keys(props).sort(), Object.keys(toResponse(STOCK)).sort());
});
