// QA PIN 로그인으로 접근할 수 있는 계정 목록.
//
// 화이트리스트인 이유: PIN 하나로 임의 이메일에 로그인하게 하면 PIN이 유출되는 순간
// 실제 사용자 계정까지 열린다. 여기 적힌 시드 계정(db/seeds/seed-demo.js)만 허용한다.
//
// 계정을 하나로 고정하지 않는 이유: 프론트가 확인해야 하는 화면이 권한·상태별로 갈린다.
// 관리자 화면, 팀 없는 유저의 가입 신청, 학교 미인증 상태, 제한된 계정의 403은
// 계정이 하나면 그중 하나만 확인할 수 있다.
//
// 여기서 이메일을 바꾸면 시드도 같이 바꿔야 한다 — 없는 계정을 가리키면 503이다.
const QA_PERSONAS = Object.freeze({
  leader: 'dummy.leader@test.com', //      팀장(Trader) — 팀·투자·모델포트폴리오
  member: 'dummy.member1@test.com', //     팀원(Analyst) — 포트폴리오 작성·투표, 퀴즈 이력
  solo: 'dummy.solo1@test.com', //         팀 없음 + 학교 인증됨 — 팀 가입 신청 흐름
  restricted: 'dummy.solo2@test.com', //   커뮤니티 제한 중 — 403 COMMUNITY_RESTRICTED, 이의신청
  unverified: 'dummy.unverified@test.com', // 학교 미인증 — 인증 유도 화면
  noschool: 'dummy.noschool@test.com', //   학교 없음 + 약관 미동의 — 온보딩 미완료
  admin: 'dummy.admin@test.com', //         role = ADMIN — /api/admin/*
});

// persona를 생략하면 이 계정으로 로그인한다. 기존 계약(팀장 고정)을 그대로 둔다.
const DEFAULT_PERSONA = 'leader';
const QA_PERSONA_KEYS = Object.freeze(Object.keys(QA_PERSONAS));

const getMainQaConfig = () => ({
  enabled: process.env.MAIN_QA_AUTH_ENABLED === 'true',
  pinHash: process.env.MAIN_QA_AUTH_PIN_HASH?.trim() || '',
  userEmail: QA_PERSONAS[DEFAULT_PERSONA],
  personas: QA_PERSONAS,
  sessionTtlHours: 8,
});

module.exports = { getMainQaConfig, QA_PERSONAS, QA_PERSONA_KEYS, DEFAULT_PERSONA };
