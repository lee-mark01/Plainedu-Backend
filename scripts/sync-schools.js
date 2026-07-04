// 커리어넷 학교 데이터를 schools 테이블에 적재하는 CLI 스크립트
//
// 사용법:
//   node scripts/sync-schools.js                 # 기본: 고등학교 + 대학
//   node scripts/sync-schools.js high_list        # 고등학교만
//   node scripts/sync-schools.js elem_list midd_list high_list univ_list
//
// (관리자 토큰 없이 초기 시딩할 때 사용)
require('dotenv').config();

const pool = require('../src/config/db');
const schoolService = require('../src/domains/school/school.service');

(async () => {
  const gubuns = process.argv.slice(2);
  try {
    const result = await schoolService.syncSchools(gubuns.length ? gubuns : undefined);
    console.log('학교 동기화 완료');
    console.table(result.details);
    console.log(
      `총 ${result.totalFetched}건 조회 / 신규 ${result.totalInserted}건 삽입 / ` +
      `DB 전체 ${result.totalInDb}건 (${result.elapsedMs}ms)`
    );
    process.exitCode = 0;
  } catch (err) {
    console.error('학교 동기화 실패:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
