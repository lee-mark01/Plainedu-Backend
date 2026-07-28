const rankingService = require('./ranking.service');
const accountService = require('../account/account.service');

// mysql2가 DATE를 로컬 자정 Date로 돌려줘서 toISOString() 직행 시 UTC+ 지역에서 하루 밀릴 수 있음
// → 항상 'YYYY-MM-DD' 문자열로 정규화 후 순수 달력일 차이로 D-day 계산 (attendance.service.formatDate와 동일 정책)
const dateOnly = (value) => {
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const daysBetween = (fromStr, toStr) => {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
};

// GET /api/ranking/individual?page=&limit= — ZSET 미계산 시 빈 목록 + updated_at: null (스펙 §8)
const getIndividualLeaderboard = async (req, res, next) => {
  try {
    const { page, limit } = req.validated;
    const data = await rankingService.getIndividualLeaderboard({ page, limit });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/ranking/teams?page=&limit= — TeamScore(Point)·R% 노출(Alignment는 스텁이라 미노출), 동점은 공동 순위
const getTeamLeaderboard = async (req, res, next) => {
  try {
    const { page, limit } = req.validated;
    const data = await rankingService.getTeamLeaderboard({ page, limit });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/ranking/schools?mode=individual|team&page=&limit= — 소속(학교) 리더보드, 단위(%/Point) 응답 포함
const getSchoolLeaderboard = async (req, res, next) => {
  try {
    const { mode, page, limit } = req.validated;
    const data = await rankingService.getSchoolLeaderboard({ mode, page, limit });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/ranking/me — 개인 + 팀 + 소속 2종 순위 요약 (무소속이면 team null, 학교 미설정이면 소속 null)
const getMyRanking = async (req, res, next) => {
  try {
    const data = await rankingService.getMyRankingSummary(req.user.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/ranking/season — 현재 시즌 기간/D-day (시즌 생성·수명주기는 account.service 소관, 여긴 조회만)
const getSeason = async (req, res, next) => {
  try {
    const season = await accountService.getOrCreateActiveSeason();
    const startStr = dateOnly(season.start_date);
    const endStr = dateOnly(season.end_date);
    const dDay = daysBetween(dateOnly(new Date()), endStr);

    res.json({
      success: true,
      data: {
        season_id: season.id,
        name: season.name,
        start_date: startStr,
        end_date: endStr,
        total_days: season.total_days,
        status: season.status,
        d_day: dDay,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getIndividualLeaderboard,
  getTeamLeaderboard,
  getSchoolLeaderboard,
  getMyRanking,
  getSeason,
};
