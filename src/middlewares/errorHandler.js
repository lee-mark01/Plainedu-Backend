const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  const status = err.status || 500;
  const message = err.message || '서버 내부 오류가 발생했습니다.';
  const body = { success: false, message };
  if (err.code) body.code = err.code;

  res.status(status).json(body);
};

module.exports = errorHandler;
