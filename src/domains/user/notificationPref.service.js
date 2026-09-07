const notificationPrefRepository = require('./notificationPref.repository');
const { buildResponse, isValidKey } = require('./notificationPref.defaults');

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

module.exports = { getPrefs, savePrefs };
