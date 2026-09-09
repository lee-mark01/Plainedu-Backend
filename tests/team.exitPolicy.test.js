// 팀 탈퇴·해체 정책 판정 — 의존성 0, DB 불필요.
// `node --test tests/`로 실행.
//
// 여기서 검증하는 정책 (2026-09-03 결정):
//   - 탈퇴는 언제나 가능하다. 팀장이라고 막지 않는다.
//   - 팀장이 나가면 가장 오래된 팀원에게 자동 위임한다.
//   - 팀장이 혼자면 탈퇴가 곧 해체다.
// 프론트는 exit-options의 판정만 보고 화면을 그리므로, 이 결과가 곧 계약이다.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildExitOptions, pickSuccessor } = require('../src/domains/team/team.service');

// findMembersForUpdate가 joined_at ASC, user_id ASC로 정렬해 넘겨주는 형태를 그대로 흉내낸다.
const members = (...rows) =>
  rows.map(([user_id, role, joined_at]) => ({
    user_id,
    role,
    joined_at,
    nickname: `u${user_id}`,
  }));

test('일반 팀원은 그냥 탈퇴한다', () => {
  const options = buildExitOptions(5, 'MEMBER', 2, members([1, 'LEADER', '2026-01-01'], [2, 'MEMBER', '2026-02-01']));

  assert.equal(options.can_leave, true);
  assert.equal(options.leave_effect, 'LEAVE');
  assert.equal(options.can_delegate, false);
  assert.equal(options.can_disband, false);
  assert.deepEqual(options.delegatable_members, []);
  assert.equal(options.reasons.delegate, '팀장만 위임할 수 있습니다.');
  assert.equal(options.reasons.disband, '팀장만 팀을 해체할 수 있습니다.');
});

test('팀원이 있는 팀장은 자동 위임 후 탈퇴한다', () => {
  const options = buildExitOptions(
    5,
    'LEADER',
    1,
    members([1, 'LEADER', '2026-01-01'], [2, 'MEMBER', '2026-02-01'], [3, 'MEMBER', '2026-03-01'])
  );

  assert.equal(options.leave_effect, 'AUTO_DELEGATE');
  assert.equal(options.can_delegate, true);
  assert.equal(options.can_disband, true);
  assert.equal(options.reasons.delegate, null);
  assert.equal(options.reasons.disband, null);
  // 후보에 자기 자신이 들어가면 프론트가 자기에게 위임하는 선택지를 보여주게 된다.
  assert.deepEqual(options.delegatable_members.map((m) => m.user_id), [2, 3]);
});

test('혼자 남은 팀장은 탈퇴가 곧 해체다', () => {
  const options = buildExitOptions(5, 'LEADER', 1, members([1, 'LEADER', '2026-01-01']));

  assert.equal(options.can_leave, true);
  assert.equal(options.leave_effect, 'DISBAND');
  // 넘길 사람이 없으니 위임은 불가능하지만 해체는 가능하다.
  assert.equal(options.can_delegate, false);
  assert.equal(options.can_disband, true);
  assert.equal(options.reasons.delegate, '팀에 다른 팀원이 없습니다.');
  assert.deepEqual(options.delegatable_members, []);
});

test('자동 위임 대상은 가장 먼저 들어온 팀원이다', () => {
  const rows = members([1, 'LEADER', '2026-01-01'], [2, 'MEMBER', '2026-02-01'], [3, 'MEMBER', '2026-03-01']);

  assert.equal(pickSuccessor(rows, 1).user_id, 2);
  // 나가는 사람이 후보에서 빠지는지 — 자기 자신에게 위임하면 팀장이 그대로 남는다.
  assert.equal(pickSuccessor(rows, 2).user_id, 1);
});

test('혼자면 넘겨받을 사람이 없다', () => {
  assert.equal(pickSuccessor(members([1, 'LEADER', '2026-01-01']), 1), null);
});
