const stockAlertService = require('./stockAlert.service');

// GET /api/stock-alerts/:symbol — 종목별 알림 조회 (요청 4)
const getAlerts = async (req, res, next) => {
  try {
    const data = await stockAlertService.getAlerts(req.user.userId, req.validated.symbol);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// PUT /api/stock-alerts/:symbol — 종목별 알림 저장 (요청 5). 같은 body를 다시 보내도 결과가 같다.
const saveAlerts = async (req, res, next) => {
  try {
    const { symbol, alerts } = req.validated;
    const data = await stockAlertService.saveAlerts(req.user.userId, symbol, alerts);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// POST /api/stock-alerts/push-token — 기기 푸시 토큰 등록 (요청 6)
const registerPushToken = async (req, res, next) => {
  try {
    const { token, platform } = req.validated;
    const data = await stockAlertService.registerPushToken(req.user.userId, token, platform);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAlerts, saveAlerts, registerPushToken };
