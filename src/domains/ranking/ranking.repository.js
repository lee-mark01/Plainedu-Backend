// 랭킹 표시용 SQL — 점수 자체는 account.valuation이 write-back한 VirtualAccounts를 읽고,
// ActiveDays는 Attendances(user 도메인, 시즌 범위 무관 누적 테이블)를 시즌 기간으로 직접 필터링해 센다.
const pool = require('../../config/db');

// 시즌 기간 내 출석일 수 — ActiveDays = 출석일 
// 미래 구간은 세지 않도록 종료 경계를 min(오늘, SeasonEnd)로 제한.
// 출석 기록이 없는 유저도 0으로 채워 반환 (Map 조회 시 undefined 방지).
const findActiveDaysByUserIds = async (userIds, seasonStart, seasonEnd, executor = pool) => {
  const map = new Map(userIds.map((id) => [id, 0]));
  if (!userIds.length) return map;

  const [rows] = await executor.query(
    `SELECT user_id, COUNT(*) AS active_days
     FROM Attendances
     WHERE user_id IN (?) AND attendance_date BETWEEN ? AND LEAST(CURDATE(), ?)
     GROUP BY user_id`,
    [userIds, seasonStart, seasonEnd]
  );
  rows.forEach((r) => map.set(r.user_id, r.active_days));
  return map;
};

// 팀 ActiveDays = 팀원 출석일 평균 (팀은 출석 개념이 없어 팀원 평균으로 정의).
// 출석 0인 팀원도 분모에 포함(COALESCE 0). 팀원이 없거나 미조회 팀은 0으로 채움.
const findTeamAvgActiveDays = async (teamIds, seasonStart, seasonEnd, executor = pool) => {
  const map = new Map(teamIds.map((id) => [id, 0]));
  if (!teamIds.length) return map;

  const [rows] = await executor.query(
    `SELECT tm.team_id, AVG(COALESCE(a.days, 0)) AS avg_days
     FROM TeamMembers tm
     LEFT JOIN (
       SELECT user_id, COUNT(*) AS days
       FROM Attendances
       WHERE attendance_date BETWEEN ? AND LEAST(CURDATE(), ?)
       GROUP BY user_id
     ) a ON a.user_id = tm.user_id
     WHERE tm.team_id IN (?)
     GROUP BY tm.team_id`,
    [seasonStart, seasonEnd, teamIds]
  );
  rows.forEach((r) => map.set(r.team_id, Number(r.avg_days)));
  return map;
};

// 리더보드 표시용 프로필 (닉네임 + 학교명). 학교 미소속(school_id NULL)은 school_name null.
const findUserProfiles = async (userIds, executor = pool) => {
  const map = new Map();
  if (!userIds.length) return map;

  const [rows] = await executor.query(
    `SELECT u.id AS user_id, u.nickname, s.school_name
     FROM Users u
     LEFT JOIN schools s ON s.id = u.school_id
     WHERE u.id IN (?)`,
    [userIds]
  );
  rows.forEach((r) => map.set(r.user_id, { nickname: r.nickname, school_name: r.school_name || null }));
  return map;
};

// 팀 리더보드 표시용 (팀명 + 학교명 + write-back된 R%).
// R%는 ZSET의 TeamScore에서 역산하지 않고 VirtualAccounts.current_return_rate(배치 write-back 값)를 읽는다
// — TeamScore와 같은 배치에서 갱신되므로 시점이 일치한다. 팀 계좌 미생성이면 r_percent null.
const findTeamProfiles = async (teamIds, seasonId, executor = pool) => {
  const map = new Map();
  if (!teamIds.length) return map;

  const [rows] = await executor.query(
    `SELECT t.id AS team_id, t.name AS team_name, s.school_name, va.current_return_rate
     FROM Teams t
     LEFT JOIN schools s ON s.id = t.school_id
     LEFT JOIN VirtualAccounts va ON va.team_id = t.id AND va.season_id = ? AND va.account_type = 'TEAM'
     WHERE t.id IN (?)`,
    [seasonId, teamIds]
  );
  rows.forEach((r) =>
    map.set(r.team_id, {
      team_name: r.team_name,
      school_name: r.school_name || null,
      r_percent: r.current_return_rate == null ? null : Number(r.current_return_rate),
    })
  );
  return map;
};

// 소속(학교) 집계용 — 유저의 소속 학교. VirtualAccounts에는 school_id가 없어 Users로 조인한다.
// school_id NULL(학교 미설정) 유저는 Map에 null로 담겨 소속 집계에서 제외된다.
// 주의: school_is_verified(미인증 소속)는 현재 필터하지 않는다 — 스펙 Open Q 3(미인증 유저가
// 학교 평균에 섞이는 문제, 기획 확인 필요). 필터가 결정되면 아래 WHERE에 조건 1개만 추가.
const findSchoolIdsByUserIds = async (userIds, executor = pool) => {
  const map = new Map();
  if (!userIds.length) return map;

  const [rows] = await executor.query('SELECT id AS user_id, school_id FROM Users WHERE id IN (?)', [userIds]);
  rows.forEach((r) => map.set(r.user_id, r.school_id ?? null));
  return map;
};

// 소속(학교) 집계용 — 팀의 소속 학교 (Teams.school_id). NULL이면 null.
const findSchoolIdsByTeamIds = async (teamIds, executor = pool) => {
  const map = new Map();
  if (!teamIds.length) return map;

  const [rows] = await executor.query('SELECT id AS team_id, school_id FROM Teams WHERE id IN (?)', [teamIds]);
  rows.forEach((r) => map.set(r.team_id, r.school_id ?? null));
  return map;
};

// 소속 리더보드 표시용 학교명.
const findSchoolProfiles = async (schoolIds, executor = pool) => {
  const map = new Map();
  if (!schoolIds.length) return map;

  const [rows] = await executor.query('SELECT id AS school_id, school_name FROM schools WHERE id IN (?)', [schoolIds]);
  rows.forEach((r) => map.set(r.school_id, r.school_name));
  return map;
};

// 주간 Alignment 확정값 (금요일 종가 기준) — 팀당 시즌당 1행 UPSERT
const upsertTeamAlignments = async (rows, executor = pool) => {
  if (!rows.length) return 0;
  const values = rows.map((r) => [r.team_id, r.season_id, r.alignment, r.priced_at]);
  await executor.query(
    `INSERT INTO TeamAlignments (team_id, season_id, alignment, priced_at)
     VALUES ?
     ON DUPLICATE KEY UPDATE alignment = VALUES(alignment), priced_at = VALUES(priced_at)`,
    [values]
  );
  return rows.length;
};

// 팀별 저장된 Alignment 조회 — 행 없는 팀(Active MP 미보유·첫 금요일 전)은 Map 미포함 → 호출측 0 처리
const findTeamAlignments = async (teamIds, seasonId, executor = pool) => {
  const map = new Map();
  if (!teamIds.length) return map;

  const [rows] = await executor.query(
    'SELECT team_id, alignment FROM TeamAlignments WHERE season_id = ? AND team_id IN (?)',
    [seasonId, teamIds]
  );
  rows.forEach((r) => map.set(r.team_id, Number(r.alignment)));
  return map;
};

// 일일 스냅샷 UPSERT — uq_dr_target_date(target_type, target_id, rank_date, season_id) 활용,
// 같은 날 재실행 시 행 수 불변(멱등). alignment_score·participation_rate는 미정의 보드에서 NULL
// (스텁 값을 영구 기록하지 않는다 — 2026-07-28 결정).
const UPSERT_CHUNK_SIZE = 500;
const upsertDailyRankings = async (rows, executor = pool) => {
  if (!rows.length) return 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const values = rows.slice(i, i + UPSERT_CHUNK_SIZE).map((r) => [
      r.season_id,
      r.target_type,
      r.school_group ?? null, // 그룹 리그 내 순위임을 명시 (과거 통합 시절 행은 NULL)
      r.target_id,
      r.rank_date,
      r.rank_position,
      r.return_rate,
      r.final_score,
      r.participation_rate,
      r.alignment_score,
    ]);
    await executor.query(
      `INSERT INTO DailyRankings
         (season_id, target_type, school_group, target_id, rank_date, rank_position, return_rate, final_score, participation_rate, alignment_score)
       VALUES ?
       ON DUPLICATE KEY UPDATE
         school_group = VALUES(school_group),
         rank_position = VALUES(rank_position),
         return_rate = VALUES(return_rate),
         final_score = VALUES(final_score),
         participation_rate = VALUES(participation_rate),
         alignment_score = VALUES(alignment_score)`,
      [values]
    );
  }
  return rows.length;
};

// 순위변동(rank_change)용 — 각 target의 "가장 최근 과거 스냅샷" 순위. beforeDate(보통 오늘 ET) 이전
// 최신 rank_date 1건씩 (주말·공휴일로 어제 스냅샷이 없어도 그 전 거래일과 비교). 없는 target은 Map 미포함.
// 순위 시계열 (그래프용) — 일자별 내 순위·점수 + 같은 날 같은 리그의 모수(상위 N% 계산용).
// 라이브 ZSET이 아니라 DailyRankings를 읽는다.
// 모수는 같은 (시즌·대상종류·리그그룹)의 그날 행 수 — 순위가 그룹 내에서 매겨지기 때문.
// school_group은 과거 통합 시절 행이 NULL일 수 있어 <=>(NULL-safe)로 비교한다.
const findRankHistory = async (seasonId, targetType, targetId, schoolGroup, executor = pool) => {
  const [rows] = await executor.query(
    `SELECT DATE_FORMAT(m.rank_date, '%Y-%m-%d') AS date,
            m.rank_position, m.return_rate, m.final_score, t.total
     FROM DailyRankings m
     JOIN (
       SELECT rank_date, COUNT(*) AS total
       FROM DailyRankings
       WHERE season_id = ? AND target_type = ? AND school_group <=> ?
       GROUP BY rank_date
     ) t ON t.rank_date = m.rank_date
     WHERE m.season_id = ? AND m.target_type = ? AND m.target_id = ?
     ORDER BY m.rank_date`,
    [seasonId, targetType, schoolGroup ?? null, seasonId, targetType, targetId]
  );
  return rows;
};

const findPrevRanks = async (seasonId, targetType, targetIds, beforeDate, executor = pool) => {
  const map = new Map();
  if (!targetIds.length) return map;

  const [rows] = await executor.query(
    `SELECT dr.target_id, dr.rank_position
     FROM DailyRankings dr
     JOIN (
       SELECT target_id, MAX(rank_date) AS last_date
       FROM DailyRankings
       WHERE season_id = ? AND target_type = ? AND target_id IN (?) AND rank_date < ?
       GROUP BY target_id
     ) latest ON latest.target_id = dr.target_id AND latest.last_date = dr.rank_date
     WHERE dr.season_id = ? AND dr.target_type = ?`,
    [seasonId, targetType, targetIds, beforeDate, seasonId, targetType]
  );
  rows.forEach((r) => map.set(r.target_id, r.rank_position));
  return map;
};

module.exports = {
  findActiveDaysByUserIds,
  findTeamAvgActiveDays,
  findUserProfiles,
  findTeamProfiles,
  findSchoolIdsByUserIds,
  findSchoolIdsByTeamIds,
  findSchoolProfiles,
  upsertTeamAlignments,
  findTeamAlignments,
  upsertDailyRankings,
  findRankHistory,
  findPrevRanks,
};
