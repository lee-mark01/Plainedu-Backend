const AppError = require('../../errors/AppError');
const { getMainQaConfig } = require('./mainQa.config');

const requireMainQaEnabled = (_req, _res, next) => {
  if (!getMainQaConfig().enabled) {
    return next(new AppError('요청한 경로를 찾을 수 없습니다.', 404, 'QA_AUTH_DISABLED'));
  }
  next();
};

module.exports = requireMainQaEnabled;
