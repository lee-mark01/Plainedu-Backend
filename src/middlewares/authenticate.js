const AppError = require('../errors/AppError');
const { verifyAccessToken } = require('../utils/jwt');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('인증 토큰이 없습니다.', 401));
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('토큰이 만료되었습니다.', 401, 'TOKEN_EXPIRED'));
    }
    next(new AppError('유효하지 않은 토큰입니다.', 401, 'TOKEN_INVALID'));
  }
};

module.exports = authenticate;
