const { getQaSessionService } = require('./qa.runtime');
const { getQaConfig } = require('../../config/qa');
const { getQaAbuseGuard } = require('./qa.abuse');

const createQaController = ({ getConfig = getQaConfig, getAbuse = getQaAbuseGuard, getService = getQaSessionService } = {}) => ({
  createSession: async (req, res, next) => {
  try {
    const abuseGuard = getAbuse(getConfig());
    const reservation = await abuseGuard.reserve(req.ip);
    let result;
    try {
      result = await getService().createSession(req.validated.pin, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    } catch (error) {
      if (error.code !== 'QA_PIN_INVALID') await abuseGuard.release(reservation);
      throw error;
    }
    await abuseGuard.release(reservation);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
  },
});

module.exports = { ...createQaController(), createQaController };
