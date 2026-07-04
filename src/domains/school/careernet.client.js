const axios = require('axios');
const AppError = require('../../errors/AppError');

// 커리어넷 학교정보 OpenAPI
// 문서: https://www.career.go.kr/cnet/front/openapi/openApiUseGuideCntntsView.do
const CAREERNET_API_URL = 'https://www.career.go.kr/cnet/openapi/getOpenApi.json';

// gubun(학교 구분) 코드 → 라벨
const SCHOOL_GUBUN = {
  elem_list: '초등학교',
  midd_list: '중학교',
  high_list: '고등학교',
  univ_list: '대학',
};

// 커리어넷 학교정보 한 페이지 조회
// @returns {{ schools: Array<{ schoolName, region }>, totalCount: number }}
const fetchSchoolPage = async (gubun, thisPage, perPage) => {
  const apiKey = process.env.CAREERNET_API_KEY;
  if (!apiKey) throw new AppError('CAREERNET_API_KEY가 설정되지 않았습니다.', 500);
  if (!SCHOOL_GUBUN[gubun]) throw new AppError(`지원하지 않는 학교 구분입니다: ${gubun}`, 400);

  try {
    const { data } = await axios.get(CAREERNET_API_URL, {
      params: {
        apiKey,
        svcType: 'api',
        svcCode: 'SCHOOL',
        contentType: 'json',
        gubun,
        thisPage,
        perPage,
      },
      timeout: 15000,
    });

    const content = data?.dataSearch?.content;
    if (!Array.isArray(content)) {
      console.error('[CareerNet] 예상치 못한 응답:', JSON.stringify(data).slice(0, 300));
      throw new AppError('커리어넷 응답 형식이 올바르지 않습니다.', 502);
    }

    const schools = content
      .map((item) => ({
        schoolName: item.schoolName?.trim(),
        region: item.region?.trim() || null,
      }))
      .filter((s) => s.schoolName);

    // totalCount는 각 레코드에 전체 건수로 내려옴 (페이지네이션 종료 판단용)
    const totalCount = Number(content[0]?.totalCount) || schools.length;

    return { schools, totalCount };
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('[CareerNet] 학교 조회 실패:', err.response?.data || err.message);
    throw new AppError('커리어넷에서 학교 정보를 가져오지 못했습니다.', 502);
  }
};

module.exports = { fetchSchoolPage, SCHOOL_GUBUN };
