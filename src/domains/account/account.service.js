const pool = require('../../config/db');
const accountRepository = require('./account.repository');
const userRepository = require('../user/user.repository');
const schoolRepository = require('../school/school.repository');
const tradingConfig = require('../../config/trading');
// ⚠️ 여기서 ./account.valuation을 require하지 말 것 — config/redis가 로드 시점에 재접속 클라이언트를
// 열어서, 이 모듈을 import하는 trading/portfolio/team 테스트 프로세스가 전부 종료되지 않는다.
// 평가가 필요한 응답 조립은 컨트롤러 계층(account.controller.buildAccountSummary)에 둔다.

// 'YYYY-MM-DD' 정규화 — mysql2가 DATE를 로컬 자정 Date로 주므로 toISOString()은 하루 밀릴 수 있다
// (ranking.controller.dateOnly / attendance.service.formatDate와 동일 정책)
const pad = (n) => String(n).padStart(2, '0');
const dateOnly = (value) => {
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

// 분기 시즌 달력 — 1/4/7/10월 1일 시작 ~ 그 분기 마지막 날 종료, 연 4회 (노션 리그 문서 §2).
// total_days = (end - start) + 1 이라 분기 길이(90~92일)가 그대로 참여율 분모가 된다.
const quarterSeasonOf = (date) => {
  const year = date.getFullYear();
  const quarter = Math.floor(date.getMonth() / 3); // 0..3
  const startMonth = quarter * 3; // 0, 3, 6, 9
  const endMonth = startMonth + 2;
  const endDay = new Date(year, endMonth + 1, 0).getDate(); // 다음 달 0일 = 이번 달 말일
  return {
    name: `${year}년 ${quarter + 1}분기`,
    start_date: `${year}-${pad(startMonth + 1)}-01`,
    end_date: `${year}-${pad(endMonth + 1)}-${pad(endDay)}`,
    total_days:
      Math.round((Date.UTC(year, endMonth, endDay) - Date.UTC(year, startMonth, 1)) / 86400000) + 1,
  };
};

// 활성 시즌 조회 + 필요 시 분기 전환. 모든 조회 경로가 이 함수를 지나므로 별도 스케줄러 없이
// "종료일이 지난 시즌은 다음 요청에서 닫히고 현재 분기 시즌이 열린다".
// 계좌 초기화는 코드가 필요 없다 — 계좌가 season_id별로 분리돼 있어 새 시즌의 첫 접근 때
// getOrCreate{Individual,Team}Account가 initial_cash로 새 계좌를 만든다.
// 운영자가 시즌을 앞당겨 끝내려면 end_date만 과거로 바꾸면 된다(수동 스크립트 불필요).
//
// 동시성: 만료 직후 여러 요청이 동시에 전환을 시도할 수 있다. 세 겹으로 막는다.
//   1) completeSeason은 status='ACTIVE' 조건부 UPDATE라 정확히 한 요청만 "닫기"에 성공한다.
//   2) createSeason은 uq_seasons_single_active(ACTIVE 최대 1개) 위반 시 null을 반환한다.
//   3) 진 요청은 아래에서 findActiveSeason을 다시 읽어 이긴 요청이 만든 시즌을 그대로 쓴다.
// 트랜잭션은 쓰지 않는다 — 닫기와 생성 사이에서 실패해도 ACTIVE가 0개인 상태로 남을 뿐이고,
// 다음 요청이 existing=null 경로로 들어와 스스로 복구한다(self-healing).
const getOrCreateActiveSeason = async () => {
  const existing = await accountRepository.findActiveSeason(pool);
  if (existing && dateOnly(existing.end_date) >= dateOnly(new Date())) return existing;

  if (existing) await accountRepository.completeSeason(pool, existing.id);
  const createdId = await accountRepository.createSeason(pool, quarterSeasonOf(new Date()));
  if (createdId) return accountRepository.findSeasonById(pool, createdId);
  return accountRepository.findActiveSeason(pool); // 경합에서 짐 — 이긴 요청의 시즌을 쓴다
};

// 시즌 단건 조회 (랭킹 배치가 특정 시즌의 기간/날짜로 참여율을 계산할 때 사용 — 조회 전용)
const getSeasonById = async (seasonId) => accountRepository.findSeasonById(pool, seasonId);

// 활성 시즌 조회 (없으면 null — 생성하지 않음). 패시브 배치(랭킹 스케줄러)가
// getOrCreateActiveSeason의 자동 시즌 생성을 피하고 "있을 때만" 도는 데 사용.
const getActiveSeason = async () => accountRepository.findActiveSeason(pool);

// 전 시즌 목록 (최신순) — 지난 시즌 화면의 시즌 선택용. 생성 부작용 없음.
const getSeasons = async () => accountRepository.findAllSeasons(pool);

// 특정 시즌의 계좌 조회 — 지난 시즌 자산 추이용. **생성하지 않는다**:
// 그 시즌에 참여하지 않았으면 계좌가 없는 게 맞음.
const getIndividualAccountForSeason = async (userId, seasonId) =>
  accountRepository.findIndividualAccount(pool, userId, seasonId);

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

// 학교를 바꾸면 개인계좌의 리그 그룹(고교/대학)도 다시 맞춘다.
// getOrCreateIndividualAccount의 자동 보정은 school_group이 NULL일 때만 도는 "최초 채우기"라,
// 이미 값이 있는 계좌는 학교가 바뀌어도 옛 그룹에 남는다(= 엉뚱한 리그에서 경쟁).
// 계좌가 아직 없으면 아무것도 안 한다 — 다음 로그인에서 새 학교 기준으로 생성된다.
const syncIndividualAccountSchoolGroup = async (userId, schoolId) => {
  const season = await getOrCreateActiveSeason();
  const account = await accountRepository.findIndividualAccount(pool, userId, season.id);
  if (!account) return;

  const schoolGroup = await deriveSchoolGroup(schoolId);
  if (schoolGroup && schoolGroup !== account.school_group) {
    await accountRepository.updateAccountSchoolGroup(pool, account.id, schoolGroup);
  }
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

// 자산(수익률) 추이 — 일일 스냅샷 그대로. 시즌 = 최대 ~90일이라 전 구간을 통째로 내리고
// 1주/1개월 같은 기간 탭은 프론트가 잘라 쓴다 (기간 파라미터·페이지네이션 없음).
// 오늘 점은 마감 배치 전까지 없다 — 라이브 값이 필요하면 요약 API의 total_equity를 이어 붙인다.
const getAssetHistory = async (account) => {
  const rows = await accountRepository.findAssetHistories(pool, account.id);
  return {
    account_id: account.id,
    season_id: account.season_id,
    items: rows.map((r) => ({
      date: r.date,
      total_equity: Number(r.total_equity),
      return_rate: Number(r.return_rate),
    })),
  };
};

module.exports = {
  quarterSeasonOf, // 단위 테스트용 (tests/season.quarter.test.js)
  getOrCreateActiveSeason,
  getSeasonById,
  getActiveSeason,
  getSeasons,
  getIndividualAccountForSeason,
  getHeldStockCodes,
  recordDailyAssetHistories,
  deriveSchoolGroup,
  getOrCreateIndividualAccount,
  syncIndividualAccountSchoolGroup,
  getOrCreateTeamAccount,
  getAssetHistory,
};
