const agreementRepository = require('./agreement.repository');

// API의 소문자 키 <-> DB ENUM 매핑. 프론트가 다루는 이름과 저장 형식을 분리해둔다.
const KEY_TO_TYPE = { terms: 'TERMS', privacy: 'PRIVACY', marketing: 'MARKETING' };

// 행이 없는 항목은 "동의한 적 없음" = false. 온보딩 판정이 항상 세 키를 모두 보게 하려면
// 여기서 기본값을 채워야 한다 — undefined가 섞이면 프론트에서 분기가 갈린다.
const toResponse = (rows) => {
  const agreed = new Set(rows.filter((r) => r.is_agreed).map((r) => r.type));
  return Object.fromEntries(
    Object.entries(KEY_TO_TYPE).map(([key, type]) => [key, agreed.has(type)])
  );
};

const getAgreements = async (userId) => toResponse(await agreementRepository.findByUserId(userId));

// 보낸 항목만 갱신한다(부분 수정). 마이페이지에서 마케팅만 끄는 경우가 이 경로다.
// 필수 항목(TERMS/PRIVACY)의 false는 validator가 이미 막는다 — 철회는 곧 탈퇴라 별도 API 소관.
const saveAgreements = async (userId, input) => {
  for (const [key, type] of Object.entries(KEY_TO_TYPE)) {
    if (input[key] === undefined) continue;
    await agreementRepository.upsert(userId, type, input[key]);
  }
  return getAgreements(userId);
};

module.exports = { getAgreements, saveAgreements, toResponse };
