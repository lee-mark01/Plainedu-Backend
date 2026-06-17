const AppError = require('../../errors/AppError');
const notificationRepository = require('./notification.repository');

// 알림 목록 조회
const getNotifications = async (user_id, limit) => {
  return await notificationRepository.findByUserId(user_id, limit);
};

// 알림 읽음 처리
const markAsRead = async (notification_id, user_id) => {
  const affected = await notificationRepository.markAsRead(notification_id, user_id);
  if (affected === 0) {
    throw new AppError('Notification not found', 404);
  }
};

// 알림 전체 읽음 처리
const markAllAsRead = async (user_id) => {
  await notificationRepository.markAllAsRead(user_id);
};

// 알림 생성 (내부에서 호출용)
const createNotification = async (user_id, sender_id, type, reference_id, content) => {
  if (user_id === sender_id) return; // 자기 자신에게는 알림 안 보냄
  return await notificationRepository.save(user_id, sender_id, type, reference_id, content);
};

module.exports = { getNotifications, markAsRead, markAllAsRead, createNotification };
