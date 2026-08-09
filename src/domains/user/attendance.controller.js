const attendanceService = require('./attendance.service');

// 출석 체크인 (앱 접속 시 프론트가 명시적으로 호출)
const checkIn = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    await attendanceService.checkAndRecordAttendance(userId);

    res.status(200).json({
      success: true,
      message: '출석 처리되었습니다.',
    });
  } catch (error) {
    next(error);
  }
};

// 최근 7일 출석 + 연속학습일 (칭찬 화면용)
const getStreak = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const result = await attendanceService.getAttendanceStreak(userId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// 월별 출석 조회
const getAttendance = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { year, month } = req.query;
    const result = await attendanceService.getMonthlyAttendance(
      userId,
      Number(year) || new Date().getFullYear(),
      Number(month) || new Date().getMonth() + 1
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkIn,
  getStreak,
  getAttendance,
};
