const notificationPrefService = require('./notificationPref.service');

// GET /api/users/me/notification-prefs — 알림 설정 조회 (요청 13)
const getPrefs = async (req, res, next) => {
  try {
    const data = await notificationPrefService.getPrefs(req.user.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/users/me/notification-prefs — 알림 설정 부분 수정 (요청 14)
const updatePrefs = async (req, res, next) => {
  try {
    const data = await notificationPrefService.savePrefs(req.user.userId, req.validated);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getPrefs, updatePrefs };
