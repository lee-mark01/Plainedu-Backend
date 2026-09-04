const Joi = require('joi');

// chart.validator의 symbolParamsSchema와 같은 형식을 쓴다 — 종목 경로 파라미터가
// 도메인마다 다르게 검증되면 같은 심볼이 한쪽에서만 통과한다.
const symbolParamsSchema = Joi.object({
  symbol: Joi.string()
    .uppercase()
    .pattern(/^[A-Z0-9.]{1,12}(\/[A-Z0-9.]{1,12})?$/)
    .required()
    .messages({ 'string.pattern.base': '올바르지 않은 심볼 형식입니다.' }),
});

// PUT /api/stock-alerts/:symbol
//
// alerts가 그 종목의 전체 설정이다. 빈 배열은 "이 종목 알림 전부 해제"라는 뜻이라 허용한다.
// 같은 type을 두 번 담으면 어느 쪽이 이기는지 서버가 정해야 하므로 아예 막는다 —
// unique로 걸러 프론트가 화면에서 중복을 만들지 않게 한다.
const alertItemSchema = Joi.object({
  type: Joi.string().valid('TARGET_PRICE', 'STOP_LOSS', 'DAILY_CHANGE', 'VOLUME').required().messages({
    'any.only': '알림 종류는 TARGET_PRICE, STOP_LOSS, DAILY_CHANGE, VOLUME 중 하나여야 합니다.',
  }),
  // 가격·등락률·거래량이 한 필드에 들어온다. 음수 등락률(-5%)이 필요하므로 부호를 막지 않고,
  // 단위 해석은 type이 맡는다.
  threshold: Joi.number().required().messages({
    'any.required': '기준값(threshold)을 입력해주세요.',
    'number.base': '기준값은 숫자여야 합니다.',
  }),
  is_enabled: Joi.boolean().default(true),
});

const saveAlertsSchema = Joi.object({
  alerts: Joi.array()
    .items(alertItemSchema)
    .max(4)
    .unique((a, b) => a.type === b.type)
    .required()
    .messages({
      'array.unique': '같은 종류의 알림을 두 번 보낼 수 없습니다.',
      'array.max': '한 종목에 설정할 수 있는 알림은 4개까지입니다.',
      'any.required': 'alerts 배열을 보내주세요. 빈 배열은 전체 해제를 뜻합니다.',
    }),
});

// POST /api/stock-alerts/push-token
const pushTokenSchema = Joi.object({
  token: Joi.string().trim().min(1).max(255).required().messages({
    'any.required': '푸시 토큰을 보내주세요.',
  }),
  platform: Joi.string().valid('IOS', 'ANDROID', 'WEB').required().messages({
    'any.only': '플랫폼은 IOS, ANDROID, WEB 중 하나여야 합니다.',
  }),
});

module.exports = { symbolParamsSchema, saveAlertsSchema, pushTokenSchema };
