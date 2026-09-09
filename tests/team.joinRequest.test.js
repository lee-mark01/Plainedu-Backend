// 팀 가입 신청 정책 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
//
// 정책(2026-09-09 결정): 코드를 맞게 입력하면 가입 신청이 되고 팀장이 승인해야 들어간다.
//   ① 정원이 찬 팀에는 신청 불가
//   ② 대기 중 신청은 유저당 하나만
//   ③ 같은 팀 중복 신청 불가
//   ④ 거절 후 재신청 가능
//   ⑤ 신청 시 팀장에게 알림
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const {
  joinRequestListSchema,
  decideJoinRequestSchema,
} = require('../src/domains/team/team.validator');

test('승인·거절 요청은 신청 id와 결정을 모두 요구한다', () => {
  assert.equal(decideJoinRequestSchema.validate({ request_id: 3, decision: 'APPROVE' }).error, undefined);
  assert.equal(decideJoinRequestSchema.validate({ request_id: 3, decision: 'REJECT' }).error, undefined);

  assert.ok(decideJoinRequestSchema.validate({ request_id: 3 }).error);
  assert.ok(decideJoinRequestSchema.validate({ decision: 'APPROVE' }).error);
  // 목록 밖 값을 허용하면 status에 엉뚱한 값이 저장된다.
  assert.ok(decideJoinRequestSchema.validate({ request_id: 3, decision: 'MAYBE' }).error);
});

test('신청 목록은 상태 필터가 선택이고 기본 페이지네이션이 붙는다', () => {
  const { value, error } = joinRequestListSchema.validate({});
  assert.equal(error, undefined);
  assert.equal(value.page, 1);
  assert.equal(value.limit, 20);
  assert.equal(value.status, undefined); // 생략하면 전체

  assert.equal(joinRequestListSchema.validate({ status: 'PENDING' }).error, undefined);
  assert.ok(joinRequestListSchema.validate({ status: 'WAITING' }).error);
});

test('① 정원이 찬 팀에는 신청을 받지 않는다', () => {
  const source = read('src/domains/team/joinRequest.service.js');
  assert.match(source, /current_member_count >= team\.max_member_count/);
  assert.match(source, /'TEAM_FULL'/);
});

test('② 대기 신청을 잠근 뒤 판단하고, 다른 팀 건은 취소한다', () => {
  // 잠그지 않으면 두 요청이 모두 "대기 신청 없음"을 보고 각자 만들어 두 팀에 걸친다.
  const service = read('src/domains/team/joinRequest.service.js');
  const repository = read('src/domains/team/joinRequest.repository.js');

  assert.match(repository, /FOR UPDATE/);
  assert.match(service, /findPendingByUserForUpdate\(userId, conn\)/);
  assert.match(service, /cancelPending\(pending\.map/);
});

test('③ 같은 팀 중복 신청은 막는다', () => {
  const source = read('src/domains/team/joinRequest.service.js');
  assert.match(source, /pending\.some\(\(p\) => p\.team_id === team\.id\)/);
  assert.match(source, /'ALREADY_REQUESTED'/);
});

test('취소는 삭제가 아니라 상태 변경이다', () => {
  // 지우면 "왜 사라졌지"를 설명할 수 없고 팀장 목록에서도 흔적이 없어진다.
  const source = read('src/domains/team/joinRequest.repository.js');
  assert.match(source, /SET status = 'CANCELED'/);
  assert.doesNotMatch(source, /DELETE FROM TeamJoinRequests/);
});

test('승인 시 정원과 소속을 다시 확인한다', () => {
  // 신청 시점과 승인 시점 사이에 정원이 차거나 신청자가 다른 팀에 들어갈 수 있다.
  const source = read('src/domains/team/joinRequest.service.js');
  const start = source.indexOf('const decideJoinRequest');
  const body = source.slice(start);

  assert.match(body, /findByIdForUpdate\(membership\.team_id, conn\)/, '팀을 잠그지 않았다');
  assert.match(body, /'TEAM_FULL'/);
  assert.match(body, /'APPLICANT_IN_TEAM'/);
});

test('승인과 멤버 등록이 한 트랜잭션이다', () => {
  // 승인만 되고 멤버 등록이 실패하면 "승인됐는데 팀원이 아닌" 상태가 남는다.
  const source = read('src/domains/team/joinRequest.service.js');
  const start = source.indexOf('const decideJoinRequest');
  const body = source.slice(start);

  assert.match(body, /withTransaction/);
  assert.match(body, /decideRequest\(requestId, 'APPROVED', userId, conn\)/);
  assert.match(body, /addMember\(team\.id, request\.user_id, conn\)/);
  assert.match(body, /updatePosition\(request\.user_id, request\.position, conn\)/);
});

test('같은 신청을 두 번 처리하면 첫 판정만 적용된다', () => {
  const source = read('src/domains/team/joinRequest.repository.js');
  assert.match(source, /WHERE id = \? AND status = 'PENDING'/);
});

test('⑤ 알림 실패가 신청을 무효로 만들지 않는다', () => {
  // 알림은 부가 기능이다. 실패해도 신청 자체는 접수돼야 한다.
  const source = read('src/domains/team/joinRequest.service.js');
  const start = source.indexOf('const notifyLeader');
  const body = source.slice(start, start + 700);

  assert.match(body, /try \{/);
  assert.match(body, /catch/);
  assert.match(body, /TEAM_JOIN_REQUEST/);
});

test('알림 발송이 수신자 설정을 확인한다', () => {
  // 설정 항목이 있는데 발송이 참조하지 않으면 사용자가 껐는데도 알림이 온다.
  const service = read('src/domains/community/notification.service.js');
  const prefService = read('src/domains/user/notificationPref.service.js');

  assert.match(service, /notificationPrefService\.isEnabled\(user_id, type\)/);
  // service.push는 마스터 스위치 — 꺼지면 개별 항목과 무관하게 보내지 않는다.
  assert.match(prefService, /PUSH_MASTER_KEY/);
});

test('알림 종류가 전부 설정 항목에 매핑된다', () => {
  // 매핑이 빠지면 그 종류는 설정으로 끌 수 없는데 화면에는 토글이 있어 보인다.
  const { TYPE_TO_PREF_KEY, PREF_KEYS } = require('../src/domains/user/notificationPref.defaults');
  const schema = read('db/schema.sql');
  const block = schema.match(/CREATE TABLE IF NOT EXISTS Notifications \(([\s\S]*?)\n\) ENGINE=/);
  const types = block[1]
    .match(/type\s+ENUM\(([^)]*)\)/)[1]
    .split(',')
    .map((s) => s.trim().replace(/'/g, ''));

  for (const type of types) {
    assert.ok(TYPE_TO_PREF_KEY[type], `${type}에 대응하는 설정 키가 없다`);
    assert.ok(PREF_KEYS.includes(TYPE_TO_PREF_KEY[type]), `${TYPE_TO_PREF_KEY[type]}가 정의에 없다`);
  }
});

test('OpenAPI가 초대·신청 계약을 문서화한다', () => {
  const spec = yaml.load(read('docs/openapi.yaml'));

  assert.ok(spec.paths['/api/teams/me/invitations']?.get);
  assert.ok(spec.paths['/api/teams/me/invitations']?.post);
  assert.ok(spec.paths['/api/teams/me/join-requests']?.get);
  assert.ok(spec.paths['/api/teams/me/join-requests']?.post);
  assert.ok(spec.components.schemas.TeamInvitation);
  assert.ok(spec.components.schemas.TeamJoinRequest);

  // 가입이 즉시 완료가 아니라 신청이라는 게 계약이다 — 응답에 PENDING이 명시돼야 한다.
  const joinRes = spec.paths['/api/teams/join'].post.responses['200']
    .content['application/json'].schema.allOf[1].properties.data.properties;
  assert.deepEqual(joinRes.status.enum, ['PENDING']);
  assert.ok(joinRes.request_id);
});
