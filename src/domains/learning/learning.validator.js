const Joi = require('joi');

/**
 * 단일 퀴즈 답안 제출 요청 검증
 * body: { answer: <문자열 | 숫자 | 문자열 배열> }
 *
 * 퀴즈 type별 형식:
 *   - CHOICE: 숫자 (선택지 번호)
 *   - OX: "O" or "X"
 *   - SHORT: 문자열
 *   - MATCH: 문자열 배열
 */
const quizAnswerSchema = Joi.object({
  answer: Joi.alternatives()
    .try(
      Joi.string().allow(''),
      Joi.number(),
      Joi.array().items(Joi.string()),
    )
    .required(),
});

/**
 * path 파라미터: quizId
 */
const quizIdSchema = Joi.object({
  quizId: Joi.number().integer().positive().required(),
});

/**
 * path 파라미터: topicId
 */
const topicIdSchema = Joi.object({
  topicId: Joi.number().integer().positive().required(),
});

/**
 * path 파라미터: shortformId
 */
const shortformIdSchema = Joi.object({
  shortformId: Joi.number().integer().positive().required(),
});

/**
 * 학습 메인 쿼리: ?level=1
 * level 누락 시 기본값 1로 처리.
 */
const topicsQuerySchema = Joi.object({
  level: Joi.number().integer().min(1).max(10).default(1),
});

module.exports = {
  quizAnswerSchema,
  quizIdSchema,
  topicIdSchema,
  shortformIdSchema,
  topicsQuerySchema,
};
