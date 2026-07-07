const { fetchSchoolPage, SCHOOL_GUBUN } = require('./careernet.client');
const schoolRepository = require('./school.repository');
const AppError = require('../../errors/AppError');

const PER_PAGE = 500;      // 커리어넷 한 페이지 요청 건수
const MAX_PAGES = 200;     // 안전장치 (무한 루프 방지)

// 앱에서 사용하는 기본 대상: 고등학교 + 대학
const DEFAULT_GUBUNS = ['high_list', 'univ_list'];

// gubun → VirtualAccounts.school_group 매핑 (초/중등은 동기화 대상이 아니라 매핑 없음)
const GUBUN_TO_SCHOOL_GROUP = { high_list: 'HIGH_SCHOOL', univ_list: 'UNIVERSITY' };

// 특정 학교 구분(gubun) 전체 페이지를 순회하며 schools 테이블에 저장
const syncGubun = async (gubun) => {
  let page = 1;
  let fetched = 0;
  let inserted = 0;
  let totalCount = Infinity;

  while (page <= MAX_PAGES) {
    const { schools, totalCount: total } = await fetchSchoolPage(gubun, page, PER_PAGE);
    if (page === 1) totalCount = total;
    if (schools.length === 0) break;

    inserted += await schoolRepository.bulkUpsertSchools(schools, GUBUN_TO_SCHOOL_GROUP[gubun] ?? null);
    fetched += schools.length;

    if (fetched >= totalCount) break;
    page += 1;
  }

  return { gubun, label: SCHOOL_GUBUN[gubun], fetched, inserted };
};

// 커리어넷에서 학교 데이터를 불러와 schools 테이블에 동기화
const syncSchools = async (gubuns = DEFAULT_GUBUNS) => {
  const invalid = gubuns.filter((g) => !SCHOOL_GUBUN[g]);
  if (invalid.length) {
    throw new AppError(`지원하지 않는 학교 구분입니다: ${invalid.join(', ')}`, 400);
  }

  const startedAt = Date.now();
  const results = [];
  for (const gubun of gubuns) {
    results.push(await syncGubun(gubun));
  }

  const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
  const totalInserted = results.reduce((sum, r) => sum + r.inserted, 0);
  const totalInDb = await schoolRepository.countSchools();

  return {
    totalFetched,
    totalInserted,
    totalInDb,
    elapsedMs: Date.now() - startedAt,
    details: results,
  };
};

const searchSchools = async ({ keyword, region, limit }) => {
  return schoolRepository.searchSchools({ keyword, region, limit });
};

module.exports = { syncSchools, searchSchools, DEFAULT_GUBUNS };
