const AppError = require('../../errors/AppError');
const reportRepository = require('./report.repository');

// 접수까지만 한다. 제재를 부과하는 주체(운영자 도구 또는 신고 누적 자동 규칙)가 아직 없어서
// status는 RECEIVED에서 멈춘다. 이용 제한 조회·이의신청(요청 11·12·33)이 이 흐름의 뒷단이다.
const createReport = async (reporterId, { target_type, target_id, reason, detail }) => {
  if (target_type === 'USER' && target_id === reporterId) {
    throw new AppError('자기 자신을 신고할 수 없습니다.', 400, 'CANNOT_REPORT_SELF');
  }

  const exists = await reportRepository.targetExists(target_type, target_id);
  if (!exists) {
    throw new AppError('신고 대상을 찾을 수 없습니다.', 404, 'REPORT_TARGET_NOT_FOUND');
  }

  const reportId = await reportRepository.insertReport({
    reporter_id: reporterId,
    target_type,
    target_id,
    reason,
    detail,
  });

  if (reportId === null) {
    throw new AppError('이미 신고한 대상입니다.', 409, 'ALREADY_REPORTED');
  }

  return { report_id: reportId, target_type, target_id, status: 'RECEIVED' };
};

module.exports = { createReport };
