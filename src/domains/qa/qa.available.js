const { getQaConfig } = require('../../config/qa');
const AppError = require('../../errors/AppError');

const requireQaEnabled = (_req, _res, next) => {
  try {
    if (!getQaConfig().enabled) {
      return next(new AppError('요청한 경로를 찾을 수 없습니다.', 404, 'QA_AUTH_DISABLED'));
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = requireQaEnabled;
