const pool = require('../../config/db');
const attendanceRepository = require('./attendance.repository');

/**
 * 출석 체크 및 기록 (앱 접속 시 프론트가 명시적으로 호출)
 */
const checkAndRecordAttendance = async (userId) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 오늘 이미 출석했으면 스킵
    const todayRecord = await attendanceRepository.findTodayAttendance(userId, conn);
    if (todayRecord) {
      await conn.commit();
      return;
    }

    // 최근 출석 기록에서 연속일 계산
    const latest = await attendanceRepository.findLatestAttendance(userId, conn);

    let consecutiveDays = 1;
    let totalLearningDays = 1;

    if (latest) {
      totalLearningDays = latest.total_learning_days + 1;

      // MySQL 서버 기준 DATEDIFF(CURDATE(), attendance_date) 결과를 사용.
      // JS Date로 계산하면 timezone/시각 변환에서 어긋날 수 있음.
      if (latest.days_since_last === 1) {
        consecutiveDays = latest.consecutive_days + 1;
      }
      // days_since_last > 1이면 연속 끊김 → consecutiveDays = 1 (이미 초기값)
      // days_since_last === 0은 위 findTodayAttendance에서 이미 early return 되므로 도달 X
    }

    await attendanceRepository.insertAttendance(userId, consecutiveDays, totalLearningDays, conn);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * 이번 주(월~일 고정) 출석 체크리스트 + 연속학습일.
 * 칭찬 화면(퀴즈 완료 후 등)에서 호출.
 */
const getAttendanceStreak = async (userId) => {
  const [weekly, globalLatest] = await Promise.all([
    attendanceRepository.findWeeklyAttendance(userId),
    attendanceRepository.findLatestAttendance(userId),
  ]);

  // DB 결과를 Set으로 변환해 O(1) 조회 가능하게.
  // attendance_date가 mysql2 기본 설정에서 JS Date 객체로 오므로 'YYYY-MM-DD' 문자열로 정규화.
  const attendedSet = new Set(weekly.map((r) => formatDate(r.attendance_date)));

  // 이번 주 월요일부터 일요일까지 7개 슬롯 생성 (오늘 이후 날짜는 attended:false로 나옴 — 아직 안 왔으니까).
  // 날짜는 MySQL 서버 기준이 아니라 JS 기준이라 timezone 이슈 약간 있음.
  // 정확도가 필요해지면 SQL에서 날짜 시리즈를 만들도록 보강.
  const today = new Date();
  const jsDay = today.getDay(); // 0=일 1=월 ... 6=토
  const daysSinceMonday = (jsDay + 6) % 7; // 월=0 ... 일=6
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysSinceMonday);

  const weeklyChecklist = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = formatDate(d);
    weeklyChecklist.push({ date: dateStr, attended: attendedSet.has(dateStr) });
  }

  return {
    consecutiveDays: globalLatest?.consecutive_days || 0,
    totalLearningDays: globalLatest?.total_learning_days || 0,
    weeklyChecklist,
  };
};

const getMonthlyAttendance = async (userId, year, month) => {
  const attendances = await attendanceRepository.findMonthlyAttendance(userId, year, month);

  // 해당 월의 출석 날짜 목록
  const attendanceDates = attendances.map((a) => a.attendance_date);

  // 연속/총 학습일은 조회 중인 월과 무관하게 "유저의 현재 누적 상태"를 보여준다.
  // → 사용자가 과거 월을 보더라도 화면 상단에는 '지금 기준'의 카운트를 노출.
  const globalLatest = await attendanceRepository.findTotalLearningDays(userId);

  return {
    year,
    month,
    attendanceDates,
    totalDays: attendances.length,
    consecutiveDays: globalLatest?.consecutive_days || 0,
    totalLearningDays: globalLatest?.total_learning_days || 0,
  };
};

/**
 * 유저의 총 학습일수/연속일수 요약 (learning 도메인 레벨 계산 등 타 도메인 소비용)
 */
const getLearningDaysSummary = async (userId) => {
  return attendanceRepository.findTotalLearningDays(userId);
};

/**
 * Date 객체 또는 'YYYY-MM-DD ...' 문자열을 'YYYY-MM-DD'로 정규화.
 * mysql2가 DATE를 JS Date로 변환하기도 하고 string으로 주기도 해서 양쪽 처리.
 */
const formatDate = (value) => {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
};

module.exports = {
  checkAndRecordAttendance,
  getAttendanceStreak,
  getMonthlyAttendance,
  getLearningDaysSummary,
};
