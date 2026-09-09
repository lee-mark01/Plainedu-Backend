const notificationPrefRepository = require('./notificationPref.repository');
const {
  buildResponse,
  isValidKey,
  TYPE_TO_PREF_KEY,
  defaultFor,
  PUSH_MASTER_KEY,
} = require('./notificationPref.defaults');

// 저장된 값이 없는 신규 유저에게도 전 항목이 채워진 응답이 나간다 (요청 13).
const getPrefs = async (userId) => {
  const saved = await notificationPrefRepository.findByUserId(userId);
  return buildResponse(saved);
};

// 중첩 요청({ community: { post_like: false } })을 "group.key" 쌍으로 편다.
// validator가 이미 알 수 없는 그룹·키를 막지만, 저장 직전에 한 번 더 걸러
// 정의에 없는 pref_key가 테이블에 들어가지 않게 한다.
const toEntries = (input) =>
  Object.entries(input).flatMap(([group, keys]) =>
    Object.entries(keys)
      .map(([key, value]) => [`${group}.${key}`, value])
      .filter(([prefKey]) => isValidKey(prefKey))
  );

// 보낸 항목만 저장하고 전체 상태를 돌려준다. 응답이 곧 갱신 후 전체이므로
// 프론트가 저장 직후 다시 조회할 필요가 없다.
const savePrefs = async (userId, input) => {
  await notificationPrefRepository.upsertMany(userId, toEntries(input));
  return getPrefs(userId);
};

// 이 유저가 그 종류의 알림을 받기로 해뒀는지. 발송 직전에 확인한다.
//
// 설정 항목이 있는데 발송이 참조하지 않으면 사용자가 껐는데도 알림이 와서 결국 버그로 보인다.
// 매핑에 없는 종류는 설정으로 끌 수 없는 알림이라 그대로 통과시킨다.
//
// service.push는 마스터 스위치다 — 꺼지면 개별 항목과 무관하게 보내지 않는다.
const isEnabled = async (userId, type) => {
  const prefKey = TYPE_TO_PREF_KEY[type];
  if (!prefKey) return true;

  const saved = await notificationPrefRepository.findByUserId(userId);

  const master = saved.get(PUSH_MASTER_KEY);
  if ((master === undefined ? defaultFor(PUSH_MASTER_KEY) : master) === false) return false;

  const value = saved.get(prefKey);
  return value === undefined ? defaultFor(prefKey) : value;
};

module.exports = { getPrefs, savePrefs, isEnabled };
