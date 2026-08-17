const { getQaSessionService } = require('./qa.runtime');
const { getQaConfig } = require('../../config/qa');
const { getQaAbuseGuard } = require('./qa.abuse');

const createSession = async (req, res, next) => {
  try {
    const abuseGuard = getQaAbuseGuard(getQaConfig());
    await abuseGuard.assertAllowed(req.ip);
    const result = await getQaSessionService().createSession(req.validated.pin, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error.code === 'QA_PIN_INVALID') {
      try {
        await getQaAbuseGuard(getQaConfig()).recordFailure(req.ip);
      } catch (guardError) {
        return next(guardError);
      }
    }
    next(error);
  }
};

module.exports = { createSession };
