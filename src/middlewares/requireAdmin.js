const AppError = require('../errors/AppError');

// 관리자 전용 경로 게이트. authenticate 다음에 붙인다 (req.user가 있어야 한다).
//
// 컨트롤러 안에서 role을 직접 확인하지 않고 미들웨어로 뺀 이유: 검사를 각 핸들러에
// 흩어두면 한 곳만 빠져도 권한 구멍이 된다. 라우터에 한 번 걸면 그 아래 전체가 보호된다.
//
// 관리자 지정은 코드에 없다 — 배포 후 사람이 DB에서 role을 올린다(docs/deployment-guide.md).
// 승격 API를 두지 않은 이유: 관리자가 한두 명인 동안은 API가 오히려 공격면만 넓힌다.
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return next(new AppError('관리자 권한이 필요합니다.', 403, 'ADMIN_ONLY'));
  }
  next();
};

module.exports = requireAdmin;
