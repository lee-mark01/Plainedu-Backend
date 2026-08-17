const AppError = require('../errors/AppError');
const { verifyAccessToken } = require('../utils/jwt');

const optionalAuthenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();
  if (!authHeader.startsWith('Bearer ')) {
    return next(new AppError('유효하지 않은 토큰입니다.', 401, 'TOKEN_INVALID'));
  }
  try {
    req.user = verifyAccessToken(authHeader.slice(7));
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('토큰이 만료되었습니다.', 401, 'TOKEN_EXPIRED'));
    }
    return next(new AppError('유효하지 않은 토큰입니다.', 401, 'TOKEN_INVALID'));
  }
};

module.exports = optionalAuthenticate;
