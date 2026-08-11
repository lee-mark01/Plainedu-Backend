const pool = require('../../config/db');
const accountRepository = require('./account.repository');
const userRepository = require('../user/user.repository');
const schoolRepository = require('../school/school.repository');
const tradingConfig = require('../../config/trading');

// 진행 중인 시즌이 없으면 하나 자동 생성 (시즌 운영 화면이 따로 없는 현재 상태의 임시 대응)
const getOrCreateActiveSeason = async () => {
  const existing = await accountRepository.findActiveSeason(pool);
  if (existing) return existing;

  const start = new Date();
  const end = new Date(start.getTime() + tradingConfig.DEFAULT_SEASON_DURATION_DAYS * 86400000);
  const toDateString = (d) => d.toISOString().slice(0, 10);

  await accountRepository.createSeason(pool, {
    name: `${start.getFullYear()} 자동생성 시즌`,
    start_date: toDateString(start),
    end_date: toDateString(end),
    total_days: tradingConfig.DEFAULT_SEASON_DURATION_DAYS,
  });
  return accountRepository.findActiveSeason(pool);
};

// 시즌 단건 조회 (랭킹 배치가 특정 시즌의 기간/날짜로 참여율을 계산할 때 사용 — 조회 전용)
const getSeasonById = async (seasonId) => accountRepository.findSeasonById(pool, seasonId);

// 활성 시즌 조회 (없으면 null — 생성하지 않음). 패시브 배치(랭킹 스케줄러)가
// getOrCreateActiveSeason의 자동 시즌 생성을 피하고 "있을 때만" 도는 데 사용.
const getActiveSeason = async () => accountRepository.findActiveSeason(pool);

// held 태그 1분 동기화용(docs/market-data-strategy.md §4 held) — 조회 전용.
const getHeldStockCodes = async (seasonId) => accountRepository.findDistinctHeldStockCodes(pool, seasonId);

// 일일 자산 스냅샷 기록 (마감후 호출) — AccountAssetHistories UPSERT(멱등)
const ASSET_HISTORY_CHUNK_SIZE = 500;
const recordDailyAssetHistories = async (rows) => {
  for (let i = 0; i < rows.length; i += ASSET_HISTORY_CHUNK_SIZE) {
    await accountRepository.upsertAssetHistories(pool, rows.slice(i, i + ASSET_HISTORY_CHUNK_SIZE));
  }
  return rows.length;
};

// schools.school_group이 아직 없는 예전 동기화 데이터 대비 이름 기반 휴리스틱 폴백
const deriveSchoolGroup = async (schoolId) => {
  if (!schoolId) return null;
  const school = await schoolRepository.findById(schoolId);
  if (!school) return null;
  if (school.school_group) return school.school_group;
  return school.school_name.includes('대학') ? 'UNIVERSITY' : 'HIGH_SCHOOL';
};

const getOrCreateIndividualAccount = async (userId) => {
  const season = await getOrCreateActiveSeason();
  let account = await accountRepository.findIndividualAccount(pool, userId, season.id);

  if (!account) {
    const user = await userRepository.findById(userId);
    const schoolGroup = await deriveSchoolGroup(user.school_id);
    await accountRepository.createVirtualAccount(pool, {
      account_type: 'INDIVIDUAL',
      school_group: schoolGroup,
      user_id: userId,
      season_id: season.id,
      initial_cash: tradingConfig.INITIAL_CASH_INDIVIDUAL,
    });
    return accountRepository.findIndividualAccount(pool, userId, season.id);
  }

  if (!account.school_group) {
    const user = await userRepository.findById(userId);
    const schoolGroup = await deriveSchoolGroup(user.school_id);
    if (schoolGroup) {
      await accountRepository.updateAccountSchoolGroup(pool, account.id, schoolGroup);
      account.school_group = schoolGroup;
    }
  }
  return account;
};

const getOrCreateTeamAccount = async (teamId, schoolId) => {
  const season = await getOrCreateActiveSeason();
  const existing = await accountRepository.findTeamAccount(pool, teamId, season.id);
  if (existing) return existing;

  const schoolGroup = await deriveSchoolGroup(schoolId);
  await accountRepository.createVirtualAccount(pool, {
    account_type: 'TEAM',
    school_group: schoolGroup,
    team_id: teamId,
    season_id: season.id,
    initial_cash: tradingConfig.INITIAL_CASH_TEAM,
  });
  return accountRepository.findTeamAccount(pool, teamId, season.id);
};

module.exports = {
  getOrCreateActiveSeason,
  getSeasonById,
  getActiveSeason,
  getHeldStockCodes,
  recordDailyAssetHistories,
  deriveSchoolGroup,
  getOrCreateIndividualAccount,
  getOrCreateTeamAccount,
};
