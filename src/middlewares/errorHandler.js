// 500대는 원문을 감춘다. err.message와 err.code 둘 다 위험하다 — mysql2가 던지는 에러는
// message에 SQL과 테이블·컬럼명이, code에 'ER_DUP_ENTRY' 같은 드라이버 코드가 그대로 들어있고,
// 우리 코드는 그걸 구분 없이 클라이언트로 내려보내고 있었다.
// 대신 서버 로그에는 반드시 남긴다 — 안 남기면 운영에서 500이 나도 원인을 못 찾는다.
//
// 4xx(AppError)는 프론트가 분기하는 계약이라 message·code를 그대로 유지한다.
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;

  if (status >= 500) {
    console.error('[error]', req.method, req.originalUrl, err);
    return res.status(status).json({ success: false, message: '서버 내부 오류가 발생했습니다.' });
  }

  const body = { success: false, message: err.message || '요청을 처리하지 못했습니다.' };
  if (err.code) body.code = err.code;
  res.status(status).json(body);
};

module.exports = errorHandler;
