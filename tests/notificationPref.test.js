// 알림 수신 설정 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const {
  NOTIFICATION_PREFS,
  PREF_KEYS,
  isValidKey,
  buildResponse,
} = require('../src/domains/user/notificationPref.defaults');
const {
  updateNotificationPrefsSchema,
} = require('../src/domains/user/notificationPref.validator');

test('저장된 값이 없어도 전 항목이 채워진다', () => {
  // 신규 유저에게 undefined가 섞이면 프론트가 토글을 그리지 못한다.
  const response = buildResponse(new Map());

  for (const [group, keys] of Object.entries(NOTIFICATION_PREFS)) {
    for (const [key, fallback] of Object.entries(keys)) {
      assert.equal(response[group][key], fallback, `${group}.${key}`);
    }
  }
});

test('저장된 값이 기본값을 덮는다', () => {
  const response = buildResponse(new Map([['community.post_like', false]]));

  assert.equal(response.community.post_like, false);
  // 나머지는 기본값 그대로 — 한 항목을 껐다고 다른 항목이 따라 꺼지면 안 된다.
  assert.equal(response.community.post_comment, true);
  assert.equal(response.service.push, true);
});

test('항목 키는 group.key 형식이고 정의된 것만 유효하다', () => {
  assert.ok(PREF_KEYS.includes('community.post_like'));
  assert.ok(PREF_KEYS.includes('invest.stock_alert'));
  assert.ok(isValidKey('service.push'));

  // 정의에 없는 키가 테이블에 들어가면 조회 때 아무 데도 매핑되지 않는다.
  assert.equal(isValidKey('community.post_dislike'), false);
  assert.equal(isValidKey('unknown.push'), false);
  assert.equal(isValidKey('push'), false);
});

test('항목이 실제 알림 종류와 대응한다', () => {
  // 켜고 끌 대상이 없는 스위치를 만들지 않기 위한 확인.
  // Notifications.type ENUM과 community/invest 항목이 어긋나면 여기서 걸린다.
  const schema = read('db/schema.sql');
  // 파일 안에 type ENUM이 여럿이라 Notifications 테이블 블록으로 먼저 좁힌다.
  const block = schema.match(/CREATE TABLE IF NOT EXISTS Notifications \(([\s\S]*?)\n\) ENGINE=/);
  assert.ok(block, 'Notifications 테이블 정의를 찾지 못했다');

  const enumLine = block[1].match(/type\s+ENUM\(([^)]*)\)/);
  assert.ok(enumLine, 'Notifications.type ENUM을 찾지 못했다');

  const types = enumLine[1].split(',').map((s) => s.trim().replace(/'/g, ''));

  // 매핑은 TYPE_TO_PREF_KEY 한 곳에 있다 — 발송 필터가 그 표를 쓰므로 여기서도 같은 표를 본다.
  // 그룹 이름으로 유추하면 team처럼 새 그룹이 생길 때마다 이 테스트를 고쳐야 한다.
  const { TYPE_TO_PREF_KEY, PREF_KEYS } = require('../src/domains/user/notificationPref.defaults');

  for (const type of types) {
    const prefKey = TYPE_TO_PREF_KEY[type];
    assert.ok(prefKey, `알림 종류 ${type}에 대응하는 설정 항목이 없다`);
    assert.ok(PREF_KEYS.includes(prefKey), `${prefKey}가 설정 정의에 없다`);
  }
});

test('부분 수정을 허용한다', () => {
  // 요청 14의 핵심 — 한 항목만 보내도 통과해야 한다.
  assert.equal(updateNotificationPrefsSchema.validate({ community: { post_like: false } }).error, undefined);
  assert.equal(
    updateNotificationPrefsSchema.validate({ service: { push: false }, invest: { stock_alert: false } }).error,
    undefined
  );
});

test('빈 요청과 정의에 없는 항목을 거부한다', () => {
  // 오타를 조용히 삼키면 프론트는 저장됐다고 믿는데 서버에는 아무것도 안 남는다.
  assert.ok(updateNotificationPrefsSchema.validate({}).error);
  assert.ok(updateNotificationPrefsSchema.validate({ community: {} }).error);
  assert.ok(updateNotificationPrefsSchema.validate({ community: { post_dislike: false } }).error);
  assert.ok(updateNotificationPrefsSchema.validate({ unknown: { push: false } }).error);
  assert.ok(updateNotificationPrefsSchema.validate({ community: { post_like: 'no' } }).error);
});

test('마케팅 수신 동의는 알림 설정에 없다', () => {
  // UserAgreements.MARKETING이 이미 갖고 있다. 두 곳에 두면 값이 어긋난다.
  assert.equal(PREF_KEYS.some((k) => k.includes('marketing')), false);
});

test('알림 설정이 users 도메인 아래에 인증과 함께 걸린다', () => {
  // 운영 계약 문서가 /me/notification-prefs를 "복구 금지 과거 초안"으로 지정했다.
  // /me/saved가 도메인별 API로 해체된 것과 같은 맥락이라 /api/users/me 아래에 둔다.
  const router = read('src/domains/user/user.router.js');
  const app = read('src/app.js');

  assert.match(router, /router\.get\('\/me\/notification-prefs', authenticate/);
  assert.match(router, /router\.patch\(\s*'\/me\/notification-prefs',\s*authenticate/);
  assert.match(app, /app\.use\('\/api\/users', userRouter\)/);

  // /api/me는 더 이상 마운트하지 않는다 — 금지된 경로 형태다.
  assert.doesNotMatch(app, /app\.use\('\/api\/me'/);
});

test('OpenAPI가 알림 설정 계약을 문서화한다', () => {
  const spec = yaml.load(read('docs/openapi.yaml'));

  assert.ok(spec.paths['/api/users/me/notification-prefs']?.get);
  assert.ok(spec.paths['/api/users/me/notification-prefs']?.patch);

  // 스펙의 항목 집합이 코드 정의와 같아야 한다 — 어긋나면 프론트가 없는 토글을 그린다.
  const specProps = spec.components.schemas.NotificationPrefs.properties;
  for (const [group, keys] of Object.entries(NOTIFICATION_PREFS)) {
    assert.ok(specProps[group], `스펙에 ${group} 그룹이 없다`);
    assert.deepEqual(
      Object.keys(specProps[group].properties).sort(),
      Object.keys(keys).sort(),
      `${group} 항목이 코드와 다르다`
    );
  }
});
