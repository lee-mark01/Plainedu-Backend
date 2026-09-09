// 알림 수신 설정의 항목 정의와 기본값.
//
// 항목은 실제로 발송되는 알림에 맞춰 잡았다 — community 넷과 invest 둘은
// Notifications.type ENUM(FOLLOWEE_POST / POST_LIKE / POST_COMMENT / COMMENT_REPLY /
// VOTE_START / PORTFOLIO_CHANGED)에 그대로 대응하고, invest.stock_alert는 종목별 알림
// (StockAlerts)이 쓴다. 켜고 끌 대상이 없는 스위치를 만들지 않기 위해서다.
//
// 예외가 둘 있다. 아직 보내는 쪽이 없지만 설정 화면에 필요해 자리를 먼저 만든 항목이다:
//   - service.notice   서비스 공지 (운영 발송 도구가 아직 없음)
//   - learning.reminder 학습 리마인더 (스케줄러가 아직 없음)
// 값은 저장되고, 발송이 붙는 시점에 그대로 존중된다.
//
// service.push는 마스터 스위치다. 이게 꺼지면 나머지 값과 무관하게 푸시를 보내지 않는다.
// 기기 설정에서 알림을 끈 것과 앱 안에서 끈 것을 서버가 구분할 수 없으므로 앱 쪽 의사를 여기 둔다.
//
// 기본값은 전부 켜짐이다. 신규 유저에게 행을 미리 만들지 않고 여기서 채워 내리므로,
// 정책이 바뀌면 이 파일만 고치면 기존 유저에게도 즉시 반영된다(직접 끈 항목은 행이 있어 유지).
const NOTIFICATION_PREFS = {
  service: {
    push: true,     // 마스터 스위치
    notice: true,   // 발송 주체 미구현
  },
  learning: {
    reminder: true, // 발송 주체 미구현
  },
  invest: {
    stock_alert: true,       // StockAlerts
    vote_start: true,        // Notifications.VOTE_START
    portfolio_changed: true, // Notifications.PORTFOLIO_CHANGED
  },
  team: {
    join_request: true, // Notifications.TEAM_JOIN_REQUEST — 팀장에게 가는 가입 신청 알림
  },
  community: {
    followee_post: true,  // Notifications.FOLLOWEE_POST
    post_like: true,      // Notifications.POST_LIKE
    post_comment: true,   // Notifications.POST_COMMENT
    comment_reply: true,  // Notifications.COMMENT_REPLY
  },
};

// 저장은 "group.key" 한 문자열로 한다(pref_key). 그룹은 화면 묶음일 뿐이라
// DB까지 계층을 만들 이유가 없다.
const flattenKeys = () =>
  Object.entries(NOTIFICATION_PREFS).flatMap(([group, keys]) =>
    Object.keys(keys).map((key) => `${group}.${key}`)
  );

const PREF_KEYS = flattenKeys();

const isValidKey = (prefKey) => PREF_KEYS.includes(prefKey);

// 저장된 행(Map)을 기본값 위에 덮어 완전한 응답을 만든다.
// 항상 전 항목을 내려주므로 프론트가 undefined를 만나 분기하지 않는다.
const buildResponse = (savedByKey) =>
  Object.fromEntries(
    Object.entries(NOTIFICATION_PREFS).map(([group, keys]) => [
      group,
      Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => {
          const saved = savedByKey.get(`${group}.${key}`);
          return [key, saved === undefined ? fallback : saved];
        })
      ),
    ])
  );

// Notifications.type → 설정 키. 발송 직전에 이 유저가 그 종류를 켜뒀는지 확인하는 데 쓴다.
// 여기 없는 종류는 설정으로 끌 수 없는 알림이라는 뜻이다(현재 전부 매핑돼 있다).
const TYPE_TO_PREF_KEY = {
  FOLLOWEE_POST: 'community.followee_post',
  POST_LIKE: 'community.post_like',
  POST_COMMENT: 'community.post_comment',
  COMMENT_REPLY: 'community.comment_reply',
  VOTE_START: 'invest.vote_start',
  PORTFOLIO_CHANGED: 'invest.portfolio_changed',
  TEAM_JOIN_REQUEST: 'team.join_request',
};

// 저장된 값이 없으면 기본값을 따른다 — 행이 없는 건 "기본값 그대로"라는 뜻이다.
const defaultFor = (prefKey) => {
  const [group, key] = prefKey.split('.');
  return NOTIFICATION_PREFS[group]?.[key] ?? true;
};

module.exports = {
  NOTIFICATION_PREFS,
  PREF_KEYS,
  isValidKey,
  buildResponse,
  TYPE_TO_PREF_KEY,
  defaultFor,
  PUSH_MASTER_KEY: 'service.push',
};
