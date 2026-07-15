const pool = require('../../config/db');

// 모든 repository 함수는 마지막 인자로 executor(pool 또는 트랜잭션 conn)를 받음.
// 트랜잭션 밖 호출은 기본값(pool)으로 동작하고, 트랜잭션 안에서 호출 시 conn을 명시.

/**
 * 월별 출석 기록 조회
 *
 * 인덱스 친화 쿼리: YEAR()/MONTH() 함수 적용 대신 범위 조건 사용.
 * (user_id, attendance_date) UNIQUE 인덱스를 range scan으로 활용한다.
 */
const findMonthlyAttendance = async (userId, year, month, executor = pool) => {
  const mm = String(month).padStart(2, '0');
  const startDate = `${year}-${mm}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMm = String(nextMonth).padStart(2, '0');
  const endDate = `${nextYear}-${nextMm}-01`;

  const sql = `
    SELECT
      id,
      attendance_date,
      consecutive_days,
      total_learning_days
    FROM Attendances
    WHERE user_id = ?
      AND attendance_date >= ?
      AND attendance_date < ?
    ORDER BY attendance_date ASC
  `;
  const [rows] = await executor.query(sql, [userId, startDate, endDate]);
  return rows;
};

/**
 * 오늘 출석 기록 존재 여부 확인
 */
const findTodayAttendance = async (userId, executor = pool) => {
  const sql = `
    SELECT id, attendance_date, consecutive_days, total_learning_days
    FROM Attendances
    WHERE user_id = ? AND attendance_date = CURDATE()
  `;
  const [rows] = await executor.query(sql, [userId]);
  return rows[0] || null;
};

/**
 * 가장 최근 출석 기록 조회 (연속일 계산용).
 *
 * days_since_last: 오늘과 최근 출석일의 차이를 MySQL 서버 시각 기준으로 계산.
 * - JS Date 변환 과정에서 발생하는 timezone/시각 어긋남을 피한다.
 * - 1이면 어제 출석(연속 가능), 0이면 오늘 이미 출석, >1이면 연속 끊김.
 */
const findLatestAttendance = async (userId, executor = pool) => {
  const sql = `
    SELECT
      id,
      attendance_date,
      consecutive_days,
      total_learning_days,
      last_active_date,
      DATEDIFF(CURDATE(), attendance_date) AS days_since_last
    FROM Attendances
    WHERE user_id = ?
    ORDER BY attendance_date DESC
    LIMIT 1
  `;
  const [rows] = await executor.query(sql, [userId]);
  return rows[0] || null;
};

/**
 * 이번 주(월~일, 고정 캘린더 주) 출석 기록 조회 — 연속학습 칭찬 화면용.
 *
 * 반환: [{ attendance_date: '2026-05-14' }, ...]
 * WEEKDAY(CURDATE())는 0=월요일 ~ 6=일요일 → 오늘에서 그만큼 빼면 이번 주 월요일.
 * 날짜 비교는 MySQL 서버 시각 기준 (CURDATE/INTERVAL).
 * (user_id, attendance_date) UNIQUE 인덱스 range scan 활용.
 */
const findWeeklyAttendance = async (userId, executor = pool) => {
  const sql = `
    SELECT attendance_date
    FROM Attendances
    WHERE user_id = ?
      AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
      AND attendance_date < DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY)
    ORDER BY attendance_date ASC
  `;
  const [rows] = await executor.query(sql, [userId]);
  return rows;
};

/**
 * 출석 기록 삽입 (race-safe).
 *
 * UNIQUE(user_id, attendance_date) 충돌 시 단순히 last_active_date만 갱신한다.
 * consecutive_days / total_learning_days는 최초 INSERT 시 값을 보존
 * (동시 요청 두 건이 같은 latest를 보고 같은 값을 계산하므로 결과 일관).
 */
const insertAttendance = async (userId, consecutiveDays, totalLearningDays, executor = pool) => {
  const sql = `
    INSERT INTO Attendances (user_id, attendance_date, consecutive_days, total_learning_days, last_active_date)
    VALUES (?, CURDATE(), ?, ?, CURDATE())
    ON DUPLICATE KEY UPDATE last_active_date = CURDATE()
  `;
  const [result] = await executor.query(sql, [userId, consecutiveDays, totalLearningDays]);
  return result;
};

/**
 * 유저의 총 학습일수/연속일수 조회 (learning 도메인의 레벨 계산 등에서 사용)
 */
const findTotalLearningDays = async (userId, executor = pool) => {
  const sql = `
    SELECT
      IFNULL(MAX(total_learning_days), 0) AS total_learning_days,
      IFNULL(MAX(consecutive_days), 0) AS consecutive_days
    FROM Attendances
    WHERE user_id = ?
  `;
  const [rows] = await executor.query(sql, [userId]);
  return rows[0];
};

module.exports = {
  findMonthlyAttendance,
  findTodayAttendance,
  findLatestAttendance,
  findWeeklyAttendance,
  insertAttendance,
  findTotalLearningDays,
};
