// 랭킹 점수 순수 계산부 (의존성 0) — 산식 원본: docs/노션_리그시스템구조.md + 스펙 §3 확정 사항
// DB/Redis를 모르는 순수 함수라 node --test 단위 테스트 대상 (tests/ranking.calculator.test.js)
// orgWeightedScore는 소속 슬라이스에서 추가. alignmentScore는 랭킹에 구현하지 않는다 —
// portfolio.alignment.calculateAlignment(포트폴리오 도메인 머지, 동일 산식)를 소비 예정 (중복 구현 금지)

// 부동소수 오차 보정 반올림 (account.valuation.calculator와 동일 정책: 수익률 소수 4자리)
const round = (value, digits) => {
  const scale = 10 ** digits;
  return Math.round(Number((value * scale).toPrecision(12))) / scale;
};

// PersonalScore = (Vt − V0) / V0 × 100 (%)
// - 특례 없음: 0원 계좌는 산식 그대로 −100% (2026-07-17 팀 논의 — 노션의 '0원=0%' 규칙 폐기, 스펙 §3)
// - V0 ≤ 0 은 데이터 이상 → null (랭킹 집계 제외, valuation return_rate와 동일 방어)
const personalScore = (vt, v0) => {
  const initial = Number(v0);
  if (!(initial > 0)) return null;
  return round(((Number(vt) - initial) / initial) * 100, 4);
};

// ParticipationRatio = ActiveDays / SeasonDays (0~1 비율, 노션 §2.1 그대로 — %화는 표시 계층 소관)
// - 개인/팀 랭킹 1차 정렬에는 미적용, 동점 2차 정렬 + 소속 랭킹 가중평균에 사용 (스펙 §3)
// - SeasonDays ≤ 0 은 데이터 이상 → null
const participationRatio = (activeDays, seasonDays) => {
  const total = Number(seasonDays);
  if (!(total > 0)) return null;
  return round(Number(activeDays) / total, 4);
};

// TeamScore = (R% × 0.9) + (Alignment × 0.1) (Point, 소수 1자리 — 스펙 §3)
// - R%는 팀 계좌 수익률(개인과 동일 산식), Alignment는 0~100 (뼈대는 스텁 100 — 스펙 Open Q 4)
// - 입력 결측(null)은 데이터 이상 → null (랭킹 집계 제외)
const teamScore = (rPercent, alignment) => {
  if (rPercent == null || alignment == null) return null;
  return round(Number(rPercent) * 0.9 + Number(alignment) * 0.1, 1);
};

// OrgScore = Σ(score × ratio) / Σ(ratio) — 소속(학교) 가중평균 (노션 §3.2, 스펙 §3)
// - members: 한 학교 구성원 [{ score, ratio }]. 개인 소속은 ratio=참여율(출석일/시즌일),
//   팀 소속은 ratio=1 고정(스펙 Open Q 1) → 단순평균이 된다.
// - Σ(ratio) ≤ 0 → null (분모 0 학교는 집계 제외 — 노션 §3.2)
// - digits: 개인 소속 % 4자리 / 팀 소속 Point 1자리 (호출자가 단위에 맞게 지정)
const orgWeightedScore = (members, digits = 4) => {
  let numerator = 0;
  let denominator = 0;
  for (const m of members) {
    const score = Number(m.score);
    const ratio = Number(m.ratio);
    numerator += score * ratio;
    denominator += ratio;
  }
  if (!(denominator > 0)) return null;
  return round(numerator / denominator, digits);
};

module.exports = { personalScore, participationRatio, teamScore, orgWeightedScore };
