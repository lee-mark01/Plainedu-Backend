const AppError = require('../errors/AppError');

/**
 * 글로벌 에러 핸들러.
 *
 * - AppError: 비즈니스 에러로 간주하고 status/message/code를 그대로 응답.
 * - 그 외: 예상치 못한 에러(=버그 또는 인프라 에러). 메시지를 그대로 보여주면
 *   DB 스키마/스택 등 내부 정보가 누출될 수 있으므로 500으로 마스킹.
 *   원본 메시지는 서버 로그에만 남긴다.
 */
const errorHandler = (err, req, res, next) => {
  // AppError(예상된 비즈니스 에러)는 깔끔하게 통과
  if (err instanceof AppError) {
    const body = { success: false, message: err.message };
    if (err.code) body.code = err.code;
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }

  // 예상치 못한 에러: 서버 로그에 자세히, 클라이언트에는 마스킹
  console.error('[UnhandledError]', err);
  res.status(500).json({
    success: false,
    message: '서버 내부 오류가 발생했습니다.',
  });
};

module.exports = errorHandler;