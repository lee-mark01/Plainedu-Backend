// 주식 알림 설정 입력 검증과 배선 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const {
  symbolParamsSchema,
  saveAlertsSchema,
  pushTokenSchema,
} = require('../src/domains/stockAlert/stockAlert.validator');

test('빈 배열은 전체 해제로 허용한다', () => {
  // PUT의 alerts가 그 종목의 전체 설정이므로, 빈 배열은 "알림 없음"이라는 유효한 상태다.
  assert.equal(saveAlertsSchema.validate({ alerts: [] }).error, undefined);
  // 반대로 alerts 자체가 없으면 무엇을 원하는지 알 수 없다.
  assert.ok(saveAlertsSchema.validate({}).error);
});

test('같은 종류를 두 번 담을 수 없다', () => {
  // 둘 중 무엇이 이기는지 서버가 임의로 정하게 두지 않는다.
  const dup = {
    alerts: [
      { type: 'TARGET_PRICE', threshold: 180 },
      { type: 'TARGET_PRICE', threshold: 200 },
    ],
  };
  assert.ok(saveAlertsSchema.validate(dup).error);
});

test('네 종류를 초과할 수 없다', () => {
  const four = ['TARGET_PRICE', 'STOP_LOSS', 'DAILY_CHANGE', 'VOLUME'].map((type) => ({
    type,
    threshold: 1,
  }));
  assert.equal(saveAlertsSchema.validate({ alerts: four }).error, undefined);
  assert.ok(saveAlertsSchema.validate({ alerts: [...four, { type: 'VOLUME', threshold: 2 }] }).error);
});

test('등락률 조건은 음수를 받는다', () => {
  // -5% 하락 알림이 정상적인 요구다. 부호를 막으면 손절 쪽 조건을 표현할 수 없다.
  const { error, value } = saveAlertsSchema.validate({
    alerts: [{ type: 'DAILY_CHANGE', threshold: -5 }],
  });
  assert.equal(error, undefined);
  assert.equal(value.alerts[0].threshold, -5);
  // is_enabled를 안 보내면 켜진 것으로 본다.
  assert.equal(value.alerts[0].is_enabled, true);
});

test('알림 종류와 플랫폼은 목록 밖 값을 막는다', () => {
  assert.ok(saveAlertsSchema.validate({ alerts: [{ type: 'RSI', threshold: 30 }] }).error);
  assert.ok(pushTokenSchema.validate({ token: 'abc', platform: 'TIZEN' }).error);
  assert.equal(pushTokenSchema.validate({ token: 'abc', platform: 'IOS' }).error, undefined);
  assert.ok(pushTokenSchema.validate({ platform: 'IOS' }).error);
});

test('심볼 형식이 chart 도메인과 같다', () => {
  // 같은 심볼이 한쪽에서만 통과하면 프론트가 종목 상세와 알림 화면에서 다르게 동작한다.
  const chart = require('../src/domains/stock/chart.validator').symbolParamsSchema;

  for (const symbol of ['AAPL', 'BRK.B', 'AAPL/USD']) {
    assert.equal(symbolParamsSchema.validate({ symbol }).error, undefined, symbol);
    assert.equal(chart.validate({ symbol }).error, undefined, symbol);
  }
  for (const symbol of ['', 'TOOOOOOOOOOOOLONG', 'A B']) {
    assert.ok(symbolParamsSchema.validate({ symbol }).error, symbol);
    assert.ok(chart.validate({ symbol }).error, symbol);
  }
});

test('push-token 경로가 :symbol보다 먼저 선언된다', () => {
  // 뒤에 두면 'push-token'이 심볼로 매칭돼 404가 아니라 종목 조회로 빠진다.
  const source = read('src/domains/stockAlert/stockAlert.router.js');
  assert.ok(source.indexOf("'/push-token'") < source.indexOf("'/:symbol'"));
});

test('알림 라우터가 인증을 요구하고 app에 연결된다', () => {
  const router = read('src/domains/stockAlert/stockAlert.router.js');
  const app = read('src/app.js');

  assert.match(router, /router\.use\(authenticate\)/);
  assert.match(app, /app\.use\('\/api\/stock-alerts', stockAlertRouter\)/);
});

test('저장은 삭제 후 삽입을 한 트랜잭션으로 처리한다', () => {
  // 요청에 없는 종류를 해제해야 멱등해진다. 지우고 넣는 사이에 끊기면 설정이 통째로 사라진다.
  const service = read('src/domains/stockAlert/stockAlert.service.js');
  const repository = read('src/domains/stockAlert/stockAlert.repository.js');

  assert.match(service, /withTransaction/);
  assert.match(repository, /DELETE FROM StockAlerts WHERE user_id = \? AND stock_code = \?/);
});

test('푸시 토큰은 소유자를 옮기는 upsert다', () => {
  // 기기에서 계정을 바꿔 로그인하면 소유자가 새 계정으로 가야 한다.
  const repository = read('src/domains/stockAlert/stockAlert.repository.js');
  assert.match(repository, /ON DUPLICATE KEY UPDATE user_id = VALUES\(user_id\)/);
});

test('OpenAPI가 알림 계약을 문서화한다', () => {
  const spec = yaml.load(read('docs/openapi.yaml'));

  assert.ok(spec.paths['/api/stock-alerts/{symbol}']?.get);
  assert.ok(spec.paths['/api/stock-alerts/{symbol}']?.put);
  assert.ok(spec.paths['/api/stock-alerts/push-token']?.post);
  assert.ok(spec.components.schemas.StockAlerts);

  // 알림 종류는 프론트가 화면 항목을 그리는 근거라 값 집합이 계약이다.
  const types = spec.components.schemas.StockAlerts.properties.alerts.items.properties.type;
  assert.deepEqual(types.enum, ['TARGET_PRICE', 'STOP_LOSS', 'DAILY_CHANGE', 'VOLUME']);
});
