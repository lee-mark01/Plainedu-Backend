const notificationService = require('./notification.service');

// 알림 목록 조회
const getNotifications = async (req, res, next) => {
  try {
    const user_id = req.user.userId;
    const { limit } = req.validated;
    const notifications = await notificationService.getNotifications(user_id, limit);
    res.status(200).json({ success: true, data: notifications });
  } catch (err) {
    next(err);
  }
};

// 알림 읽음 처리
const markAsRead = async (req, res, next) => {
  try {
    const notification_id = Number(req.params.notification_id);
    const user_id = req.user.userId;
    await notificationService.markAsRead(notification_id, user_id);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// 알림 전체 읽음 처리
const markAllAsRead = async (req, res, next) => {
  try {
    const user_id = req.user.userId;
    await notificationService.markAllAsRead(user_id);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead };
