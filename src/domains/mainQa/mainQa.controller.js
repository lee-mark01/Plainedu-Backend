const authRepository = require('../auth/auth.repository');
const tokenTools = require('../../utils/jwt');
const { getMainQaConfig } = require('./mainQa.config');
const { verifyMainQaPin } = require('./mainQa.pin');
const { createMainQaService } = require('./mainQa.service');

const login = async (req, res, next) => {
  try {
    const service = createMainQaService({
      config: getMainQaConfig(),
      verifyPin: verifyMainQaPin,
      repository: authRepository,
      tokenTools,
    });
    const data = await service.login(req.validated.pin, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      persona: req.validated.persona,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

module.exports = { login };
