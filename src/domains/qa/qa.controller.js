const { getQaSessionService } = require('./qa.runtime');

const createSession = async (req, res, next) => {
  try {
    const result = await getQaSessionService().createSession(req.validated.pin, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = { createSession };
