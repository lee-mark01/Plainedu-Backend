const Joi = require('joi');
const { NOTIFICATION_PREFS } = require('./notificationPref.defaults');

// 스키마를 기본값 정의에서 만들어낸다. 항목을 추가할 때 defaults만 고치면 되고,
// 두 곳에 같은 목록을 적어두다 어긋나는 일이 없다.
//
// 모든 키가 선택이고 그룹 하나만 보내도 된다 — 부분 수정이 요청 14의 핵심이다.
// 대신 정의에 없는 그룹·키는 거부한다(Joi 기본 동작). 오타를 조용히 삼키면
// 프론트는 저장됐다고 믿는데 서버에는 아무것도 안 남는다.
const groupSchemas = Object.fromEntries(
  Object.entries(NOTIFICATION_PREFS).map(([group, keys]) => [
    group,
    Joi.object(
      Object.fromEntries(Object.keys(keys).map((key) => [key, Joi.boolean()]))
    ).min(1),
  ])
);

const updateNotificationPrefsSchema = Joi.object(groupSchemas)
  .min(1)
  .messages({ 'object.min': '변경할 알림 항목을 하나 이상 보내주세요.' });

module.exports = { updateNotificationPrefsSchema };
