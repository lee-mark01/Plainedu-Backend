// 랭킹 파이프라인 오케스트레이션 (스펙 §7: valuation 배치 → 점수 → Redis 순위판)
// 개인 · 팀 · 소속 2종(개인/팀) 순위판
const AppError = require('../../errors/AppError');
const { getEtDateString, isEtFriday } = require('../../config/marketHours');
const accountService = require('../account/account.service');
const { valuateSeasonAccounts } = require('../account/account.valuation');
const teamRepository = require('../team/team.repository');
// 포트폴리오 도메인은 읽기 전용 소비만 (Active MP·목표 비중 조회 + 순수 산식 재사용 — 파일 수정 금지)
const portfolioRepository = require('../portfolio/portfolio.repository');
const { calculateAlignment } = require('../portfolio/portfolio.alignment');
const rankingCache = require('./ranking.cache');
const rankingRepository = require('./ranking.repository');
const { participationRatio, teamScore, orgWeightedScore } = require('./ranking.calculator');

// Alignment(전략 준수도)는 매주 금요일 종가로 확정해 TeamAlignments에 저장하고(스냅샷 크론의 금요일
// 단계), 평시에는 저장값을 읽는다. Active MP 없는 팀 = 0 (전략 미제출 = 준수도 0, 2026-07-31 확정).
// 첫 금요일 확정 전에는 MP 보유 팀도 0 — 과도기 1주 이내라 허용.

// 리그 그룹 확정): 고교/대학 완전 분리 — 유저는 자기 그룹 리그만 본다.
// school_group NULL(학교 미설정·미인증)은 어느 리그에도 속하지 않아 랭킹 제외.
const LEAGUE_GROUPS = ['HIGH_SCHOOL', 'UNIVERSITY'];

// Seasons.start_date/end_date는 mysql2가 JS Date(로컬 자정)로 반환 → toISOString()은 UTC 변환 중
// KST 등 UTC+ 지역에서 하루 밀릴 수 있어 로컬 getter로 직접 포맷 (attendance.service의 formatDate와 동일 정책)
const toDateOnly = (value) => {
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// 소속(학교) org score 집계 → { entries, protectedSchools }
// D4 정합: skipped 구성원이 있는 학교는 정확한 가중평균을 낼 수 없으므로 "보호" — entries에서 빼고
// (syncBoard가 덮어쓰지 않게) protectedSchools로도 넘겨(제거도 안 되게) 직전 org score를 유지한다.
// (syncBoard의 protectedMembers는 '제거'만 막으므로 entries 제외가 함께 필요 — 안 그러면 부분 데이터로 덮어씀)
// membersOf: 학교id → [{ score, ratio }], schoolOfSkipped: skipped 계좌들의 학교id 집합
const aggregateSchoolBoard = (membersBySchool, protectedSchools, digits) => {
  const entries = [];
  for (const [schoolId, members] of membersBySchool) {
    if (protectedSchools.has(String(schoolId))) continue; // 보호 학교는 갱신하지 않음
    const org = orgWeightedScore(members, digits);
    if (org != null) entries.push({ member: schoolId, score: org });
  }
  return entries;
};

// 개인 소속: 학교별 Σ(PersonalScore × 참여율)/Σ(참여율) (% 4자리). 학교 미설정·분모 0 학교 제외.
const buildIndividualSchoolEntries = async (indivResults, skippedIndiv, seasonStart, seasonEnd, seasonDays) => {
  const freshUserIds = indivResults.map((r) => r.user_id);
  const skippedUserIds = skippedIndiv.map((s) => s.user_id);
  const allUserIds = [...new Set([...freshUserIds, ...skippedUserIds])];

  const [schoolByUser, activeDaysByUser] = await Promise.all([
    rankingRepository.findSchoolIdsByUserIds(allUserIds),
    rankingRepository.findActiveDaysByUserIds(freshUserIds, seasonStart, seasonEnd),
  ]);

  const protectedSchools = new Set();
  for (const uid of skippedUserIds) {
    const schoolId = schoolByUser.get(uid);
    if (schoolId != null) protectedSchools.add(String(schoolId));
  }

  const membersBySchool = new Map();
  for (const r of indivResults) {
    const schoolId = schoolByUser.get(r.user_id);
    if (schoolId == null) continue; // 학교 미설정 유저 제외
    const ratio = participationRatio(activeDaysByUser.get(r.user_id) ?? 0, seasonDays);
    if (ratio == null) continue; // seasonDays ≤ 0 방어
    if (!membersBySchool.has(schoolId)) membersBySchool.set(schoolId, []);
    membersBySchool.get(schoolId).push({ score: r.return_rate, ratio });
  }

  return { entries: aggregateSchoolBoard(membersBySchool, protectedSchools, 4), protectedSchools };
};

// 팀 소속: 학교별 Σ(TeamScore × 팀참여율)/Σ(팀참여율) (Point 1자리).
// 팀 참여율 = 팀원 출석일 평균 / SeasonDays 확정 — Open Q 1 해소).
// 전 팀원 미출석(ratio 0)만 있는 학교는 분모 0 → 보드 제외 (개인 소속과 동일 규칙).
const buildTeamSchoolEntries = async (teamEntries, skippedTeams, seasonStart, seasonEnd, seasonDays) => {
  const freshTeamIds = teamEntries.map((e) => e.member);
  const skippedTeamIds = skippedTeams.map((s) => s.team_id);
  const allTeamIds = [...new Set([...freshTeamIds, ...skippedTeamIds])];

  const [schoolByTeam, avgDaysByTeam] = await Promise.all([
    rankingRepository.findSchoolIdsByTeamIds(allTeamIds),
    rankingRepository.findTeamAvgActiveDays(freshTeamIds, seasonStart, seasonEnd),
  ]);

  const protectedSchools = new Set();
  for (const tid of skippedTeamIds) {
    const schoolId = schoolByTeam.get(tid);
    if (schoolId != null) protectedSchools.add(String(schoolId));
  }

  const membersBySchool = new Map();
  for (const e of teamEntries) {
    const schoolId = schoolByTeam.get(e.member);
    if (schoolId == null) continue;
    if (!membersBySchool.has(schoolId)) membersBySchool.set(schoolId, []);
    const ratio = participationRatio(avgDaysByTeam.get(e.member) ?? 0, seasonDays);
    if (ratio == null) continue; // seasonDays ≤ 0 방어
    membersBySchool.get(schoolId).push({ score: e.score, ratio });
  }

  return { entries: aggregateSchoolBoard(membersBySchool, protectedSchools, 1), protectedSchools };
};

// PersonalScore = valuation의 return_rate 그대로 사용 (스펙 전제 3: Vt/수익률 계산은 account 소관 —
// 산식 (Vt−V0)/V0×100 자체는 ranking.calculator.personalScore가 문서화·검증한다)
const recomputeRankings = async (seasonId) => {
  // 소속 참여율 계산에 시즌 기간/날짜가 필요 → 시즌 객체 전체 로드 (id만으로는 부족)
  const season = seasonId
    ? await accountService.getSeasonById(seasonId)
    : await accountService.getOrCreateActiveSeason();
  if (!season) throw new AppError('시즌을 찾을 수 없습니다.', 404);
  const targetSeasonId = season.id;
  const seasonStart = toDateOnly(season.start_date);
  const seasonEnd = toDateOnly(season.end_date);

  const { valuated_at, results, skipped } = await valuateSeasonAccounts(targetSeasonId, {
    writeBack: true,
  });

  // Alignment는 그룹 무관 팀 단위 — 전 팀 1회 조회
  const allTeamResults = results.filter((r) => r.account_type === 'TEAM' && r.team_id != null && r.return_rate != null);
  const alignmentByTeam = await rankingRepository.findTeamAlignments(
    allTeamResults.map((r) => r.team_id),
    targetSeasonId
  );

  // 그룹(고교/대학) 리그 분리: 보드 8개 = 그룹 2 × (개인·팀·소속 2종).
  // school_group NULL 계좌(학교 미설정·미인증)는 어느 리그에도 넣지 않는다.
  const summary = {};
  for (const group of LEAGUE_GROUPS) {
    const gResults = results.filter((r) => r.school_group === group);
    const gSkipped = skipped.filter((s) => s.school_group === group);

    // 개인
    const indivResults = gResults.filter((r) => r.account_type === 'INDIVIDUAL' && r.return_rate != null);
    const entries = indivResults.map((r) => ({ member: r.user_id, score: r.return_rate }));
    const skippedIndiv = gSkipped.filter((s) => s.account_type === 'INDIVIDUAL');
    const protectedMembers = new Set(skippedIndiv.map((s) => String(s.user_id)));

    // 팀: TeamScore = R%×0.9 + Alignment×0.1 (스펙 §3). Alignment는 금요일 확정 저장값(없으면 0)
    const teamEntries = gResults
      .filter((r) => r.account_type === 'TEAM' && r.team_id != null && r.return_rate != null)
      .map((r) => ({ member: r.team_id, score: teamScore(r.return_rate, alignmentByTeam.get(r.team_id) ?? 0) }))
      .filter((e) => e.score != null);
    const skippedTeams = gSkipped.filter((s) => s.account_type === 'TEAM' && s.team_id != null);
    const protectedTeams = new Set(skippedTeams.map((s) => String(s.team_id)));

    // 소속 2종 — 학교는 단일 그룹 소속이라 그룹 내 집계로 충분
    const [schoolIndiv, schoolTm] = await Promise.all([
      buildIndividualSchoolEntries(indivResults, skippedIndiv, seasonStart, seasonEnd, season.total_days),
      buildTeamSchoolEntries(teamEntries, skippedTeams, seasonStart, seasonEnd, season.total_days),
    ]);

    const [individual, team, schoolIndividual, schoolTeam] = await Promise.all([
      rankingCache.syncBoard(targetSeasonId, `${group}:individual`, entries, { protectedMembers, updatedAt: valuated_at }),
      rankingCache.syncBoard(targetSeasonId, `${group}:team`, teamEntries, { protectedMembers: protectedTeams, updatedAt: valuated_at }),
      rankingCache.syncBoard(targetSeasonId, `${group}:school:individual`, schoolIndiv.entries, {
        protectedMembers: schoolIndiv.protectedSchools,
        updatedAt: valuated_at,
      }),
      rankingCache.syncBoard(targetSeasonId, `${group}:school:team`, schoolTm.entries, {
        protectedMembers: schoolTm.protectedSchools,
        updatedAt: valuated_at,
      }),
    ]);

    summary[group] = {
      individual: { ...individual, skipped: protectedMembers.size },
      team: { ...team, skipped: protectedTeams.size },
      school_individual: { ...schoolIndividual, protected: schoolIndiv.protectedSchools.size },
      school_team: { ...schoolTeam, protected: schoolTm.protectedSchools.size },
    };
  }

  // 그룹 합산 요약 (스케줄러 로그·기존 소비자 호환)
  const sumBoard = (key) =>
    LEAGUE_GROUPS.reduce((acc, g) => {
      for (const k of Object.keys(summary[g][key])) acc[k] = (acc[k] ?? 0) + summary[g][key][k];
      return acc;
    }, {});

  return {
    season_id: targetSeasonId,
    valuated_at,
    groups: summary,
    individual: sumBoard('individual'),
    team: sumBoard('team'),
    school_individual: sumBoard('school_individual'),
    school_team: sumBoard('school_team'),
    // 일일 스냅샷이 AccountAssetHistories를 같은 배치 시점 값으로 기록할 수 있도록
    // 계좌별 평가 결과를 함께 반환 (skipped 계좌는 신선한 값이 없으므로 미포함)
    accounts: results.map((r) => ({
      account_id: r.account_id,
      total_equity: r.total_equity,
      return_rate: r.return_rate ?? 0, // write-back과 동일한 NOT NULL 방어
    })),
    // 금요일 Alignment 확정용 재료 — 같은 배치의 팀 보유종목·현재가·현금 (재조회 없이 재사용)
    team_valuations: allTeamResults.map((r) => ({
      team_id: r.team_id,
      cash_balance: r.cash_balance,
      holdings: r.holdings, // { stock_code, quantity, current_price } 포함 (calculateAlignment 입력 그대로)
    })),
  };
};

// 전체 리스트 공동 순위(1224식) — 스냅샷용. ZSET 내림차순 전제, 동점은 앞 멤버와 같은 순위.
const coRankAll = (entries) => {
  const ranks = new Array(entries.length);
  for (let i = 0; i < entries.length; i += 1) {
    ranks[i] = i > 0 && entries[i].score === entries[i - 1].score ? ranks[i - 1] : i + 1;
  }
  return ranks;
};

// 참여율(0~1) → DailyRankings.participation_rate(% 2자리). null은 그대로 (분모 0 방어)
const toParticipationPercent = (ratio) => (ratio == null ? null : Math.round(ratio * 10000) / 100);

// 일일 스냅샷 ( 16:05 ET 크론 소관) — 최종 recompute → 4개 보드 → DailyRankings UPSERT +
// 주간 Alignment 확정 (금요일 종가) — recompute가 방금 쓴 팀별 보유·현재가·현금을 그대로 재사용해
// Active MP 보유 팀만 계산·저장한다. MP 없는 팀은 행을 만들지 않음 (조회 시 0 처리).
// ponytail: 팀별 순차 조회(N+1) — 금요일 주 1회·팀 수십 규모라 허용, 팀 수백이면 배치 쿼리로 교체
const confirmWeeklyAlignments = async (teamValuations, seasonId, pricedAt) => {
  const rows = [];
  for (const tv of teamValuations) {
    const active = await portfolioRepository.findActiveByTeamId(tv.team_id);
    if (!active) continue;
    const allocations = await portfolioRepository.findAllocationsByPortfolioId(active.portfolio_id);
    const { alignment } = calculateAlignment({
      allocations,
      holdings: tv.holdings,
      cashBalance: tv.cash_balance,
    });
    rows.push({ team_id: tv.team_id, season_id: seasonId, alignment, priced_at: pricedAt });
  }
  return rankingRepository.upsertTeamAlignments(rows);
};

// AccountAssetHistories 기록. rank_date는 ET 거래일(getEtDateString) 기준으로 멱등.
// alignment_score는 저장된 주간 확정값(없으면 NULL — MP 미보유), participation_rate는 개인·팀 실값
// (팀=팀원 출석 평균, 학교는 정의 없음 → NULL) — 스텁을 영구 기록하지 않는다.
const snapshotDailyRankings = async () => {
  // 패시브 잡: 활성 시즌 없으면 생성하지 않고 skip (스케줄러와 동일 정책)
  const season = await accountService.getActiveSeason();
  if (!season) return null;
  const seasonStart = toDateOnly(season.start_date);
  const seasonEnd = toDateOnly(season.end_date);

  // 마감 시점 최종 숫자 확정 → 이 결과(ZSET·write-back·accounts)가 스냅샷 재료
  let recompute = await recomputeRankings(season.id);
  const rankDate = getEtDateString();

  // 금요일: 종가(방금 배치의 가격)로 Alignment 주간 확정 → 저장 후 재계산 1회로
  // 오늘의 TeamScore·ZSET·스냅샷에 새 값을 즉시 반영 (캐시 웜이라 재계산 저비용)
  let alignmentsConfirmed = 0;
  if (isEtFriday()) {
    alignmentsConfirmed = await confirmWeeklyAlignments(recompute.team_valuations, season.id, rankDate);
    if (alignmentsConfirmed > 0) recompute = await recomputeRankings(season.id);
  }

  const rows = [];

  // 그룹(고교/대학)별로 보드 4종을 각각 기록 — rank_position은 "그룹 리그 내 순위"
  for (const group of LEAGUE_GROUPS) {
    const [indivAll, teamAll, schoolIndivAll, schoolTeamAll] = await Promise.all([
      rankingCache.getAllEntries(season.id, `${group}:individual`),
      rankingCache.getAllEntries(season.id, `${group}:team`),
      rankingCache.getAllEntries(season.id, `${group}:school:individual`),
      rankingCache.getAllEntries(season.id, `${group}:school:team`),
    ]);
    const base = { season_id: season.id, school_group: group, rank_date: rankDate, alignment_score: null };

    // USER: API와 동일한 동점 재정렬(2차 참여율·3차 출석일·4차 user_id) — 페이지가 보여주는 순위와 일치
    if (indivAll.length) {
      const resolved = await attachParticipation(
        indivAll.map((e) => ({ member: e.member, score: e.score })),
        seasonStart,
        seasonEnd,
        season.total_days
      );
      resolved.forEach((r) => {
        rows.push({
          ...base,
          target_type: 'USER',
          target_id: r.user_id,
          rank_position: r.rank,
          return_rate: r.score,
          final_score: r.score,
          participation_rate: toParticipationPercent(r.participation_ratio),
        });
      });
    }

    // TEAM: 공동 순위(1224식, API와 동일). return_rate=R%(write-back, 같은 배치 시점), final_score=TeamScore
    if (teamAll.length) {
      const teamIds = teamAll.map((e) => Number(e.member));
      const [profiles, avgDaysByTeam, alignmentByTeam] = await Promise.all([
        rankingRepository.findTeamProfiles(teamIds, season.id),
        rankingRepository.findTeamAvgActiveDays(teamIds, seasonStart, seasonEnd),
        rankingRepository.findTeamAlignments(teamIds, season.id),
      ]);
      const ranks = coRankAll(teamAll);
      teamAll.forEach((e, i) => {
        const teamId = Number(e.member);
        rows.push({
          ...base,
          target_type: 'TEAM',
          target_id: teamId,
          // 확정 시점의 팀 이름을 함께 박는다. 팀이 해체되면 Teams 조인으로는 이름을 찾을 수
          // 없는데 이 스냅샷 행은 남으므로, 이름이 없으면 과거 순위표에 무명 행이 생긴다.
          target_name: profiles.get(teamId)?.team_name ?? null,
          rank_position: ranks[i],
          return_rate: profiles.get(teamId)?.r_percent ?? 0, // 컬럼 NOT NULL 방어 (계좌 미생성 팀은 이론상 보드 미등재)
          final_score: e.score,
          // 주간 확정 Alignment — 값 없으면 NULL(MP 미보유·첫 확정 전, TeamScore에는 0으로 반영됨)
          alignment_score: alignmentByTeam.get(teamId) ?? null,
          // 팀 참여율 = 팀원 출석일 평균 / SeasonDays
          participation_rate: toParticipationPercent(
            participationRatio(avgDaysByTeam.get(teamId) ?? 0, season.total_days)
          ),
        });
      });
    }

    // SCHOOL 2종: 공동 순위. score가 단일 값(개인소속 %, 팀소속 Point)이라 return_rate/final_score에 동일 기록
    // (return_rate NOT NULL 제약 — 학교 보드의 "수익률" 개념은 가중 score 자체)
    for (const [targetType, all] of [
      ['SCHOOL_INDIVIDUAL', schoolIndivAll],
      ['SCHOOL_TEAM', schoolTeamAll],
    ]) {
      if (!all.length) continue;
      const ranks = coRankAll(all);
      all.forEach((e, i) => {
        rows.push({
          ...base,
          target_type: targetType,
          target_id: Number(e.member),
          rank_position: ranks[i],
          return_rate: e.score,
          final_score: e.score,
          participation_rate: null, // 소속 집계에 참여율 개념 없음
        });
      });
    }
  }

  const rankingsWritten = await rankingRepository.upsertDailyRankings(rows);

  // 자산 추이(AccountAssetHistories) — 같은 recompute 배치의 계좌별 평가값. skipped 계좌는
  // 신선한 값이 없으므로 그날 행을 만들지 않는다 (어제 값을 오늘 날짜로 위조하지 않음).
  const assetRows = recompute.accounts.map((a) => ({
    account_id: a.account_id,
    recorded_at: rankDate,
    total_equity: a.total_equity,
    return_rate: a.return_rate,
  }));
  const assetsWritten = await accountService.recordDailyAssetHistories(assetRows);

  return {
    season_id: season.id,
    rank_date: rankDate,
    valuated_at: recompute.valuated_at,
    rankings_written: rankingsWritten,
    assets_written: assetsWritten,
    alignments_confirmed: alignmentsConfirmed, // 금요일에만 >0
  };
};

// 동점 처리(스펙 §3): 1차 PersonalScore(이미 ZSET 정렬) → 2차 ParticipationRatio → 3차 ActiveDays
// 주의: ZSET은 전역 정렬이지만 재정렬은 "조회 시점 페이지 단위"만 (경계 밖 동점자와는 교차 비교 안 함 — 스펙 §3 비고)
const attachParticipation = async (entries, seasonStart, seasonEnd, seasonDays) => {
  const userIds = entries.map((e) => Number(e.member));
  const [activeDaysMap, profileMap] = await Promise.all([
    rankingRepository.findActiveDaysByUserIds(userIds, seasonStart, seasonEnd),
    rankingRepository.findUserProfiles(userIds),
  ]);

  return entries
    .map((e) => {
      const userId = Number(e.member);
      const activeDays = activeDaysMap.get(userId) ?? 0;
      return {
        user_id: userId,
        score: e.score,
        active_days: activeDays,
        participation_ratio: participationRatio(activeDays, seasonDays),
        nickname: profileMap.get(userId)?.nickname ?? null,
        school_name: profileMap.get(userId)?.school_name ?? null,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.participation_ratio ?? 0) !== (a.participation_ratio ?? 0)) {
        return (b.participation_ratio ?? 0) - (a.participation_ratio ?? 0);
      }
      // 4차 user_id: 3차까지 완전 동점 시 입력(Redis fetch) 순서에 좌우되지 않게 결정적 tiebreak.
      // 스냅샷(zrevrange 역순)과 페이지·/me(zrangebyscore 정순)의 입력 순서가 달라, 이게 없으면
      // 완전 동점 그룹의 순위가 경로마다 역전되고 익일 rank_change가 오염된다 (2026-07-28 리뷰).
      return b.active_days - a.active_days || a.user_id - b.user_id;
    })
    .map((row, i) => ({ rank: (entries[0]?.rank ?? 1) + i, ...row }));
};

// rawPage를 "같은 점수가 연속되는 구간(run)"으로 쪼갠다. ZSET은 동점 멤버를 랭크상 항상 붙여서
// 배치하므로, 페이지의 첫/끝 인덱스에 닿지 않는 run은 이미 완결된 동점 그룹이다(그 밖에 같은 점수가 더 없음).
const splitRuns = (rawPage) => {
  const runs = [];
  let start = 0;
  for (let i = 1; i <= rawPage.length; i++) {
    if (i === rawPage.length || rawPage[i].score !== rawPage[start].score) {
      runs.push({ score: rawPage[start].score, startIndex: start, endIndex: i - 1 });
      start = i;
    }
  }
  return runs;
};

// 공동 순위(1224식) rank 배열 계산 — 팀·소속 리더보드 공용 (참여율 2차 정렬 근거가 없는 보드).
// 동점은 같은 순위. ZSET이 동점을 연속 배치하므로 페이지 첫 run만 이전 페이지에서 이어질 수 있어
// firstAbove(그 점수보다 높은 멤버 수)로 시작 순위를 확정하고, 이후 run은 offset 기반.
const computeCoRanks = (rawPage, runs, offset, firstAbove) => {
  const rankByIndex = new Array(rawPage.length);
  runs.forEach((run, ri) => {
    const rank = ri === 0 ? firstAbove + 1 : offset + run.startIndex + 1;
    for (let i = run.startIndex; i <= run.endIndex; i += 1) rankByIndex[i] = rank;
  });
  return rankByIndex;
};

// 페이지 경계(첫/끝 인덱스)에 걸린 동점 그룹은 이 페이지 조각만으로 전체 크기를 알 수 없다
// (예: 3명 동점 중 앞 2명만 이 raw 슬라이스에 보임 → 나머지 1명이 다른 페이지 어딘가에 있음).
// → countAbove/getMembersAtScore로 그 점수의 전체 멤버를 다시 불러와 재정렬한 뒤, 필요한 순위 구간만 사용한다.
const resolveBoundaryRun = (seasonId, board, score, seasonStart, seasonEnd, seasonDays) =>
  Promise.all([
    rankingCache.countAbove(seasonId, board, score),
    rankingCache.getMembersAtScore(seasonId, board, score),
  ]).then(([above, memberIds]) => {
    const entries = memberIds.map((m) => ({ member: m, score, rank: above + 1 }));
    return attachParticipation(entries, seasonStart, seasonEnd, seasonDays);
  });

// 요청 유저의 리그 그룹 — Users.school_id → schools.school_group (휴리스틱 폴백은 account 소관 재사용).
// 학교 미설정이면 null → 리그 미소속 (조회 API는 빈 보드 + school_group: null로 응답).
const resolveUserGroup = async (userId) => {
  const schoolByUser = await rankingRepository.findSchoolIdsByUserIds([Number(userId)]);
  const schoolId = schoolByUser.get(Number(userId));
  if (schoolId == null) return null;
  return accountService.deriveSchoolGroup(schoolId);
};

// 리그 미소속(학교 미설정) 유저의 리더보드 응답 — 프론트는 school_group: null로 "학교 설정 유도" 표시
const emptyBoard = (seasonId, page, limit, extra = {}) => ({
  season_id: seasonId,
  school_group: null,
  ...extra,
  updated_at: null,
  pagination: { page, limit, total: 0 },
  rankings: [],
});

// GET /api/ranking/individual — 요청 유저의 그룹(고교/대학) 리그만 조회
const getIndividualLeaderboard = async (userId, { page = 1, limit = 20 } = {}) => {
  const season = await accountService.getOrCreateActiveSeason();
  const group = await resolveUserGroup(userId);
  if (!group) return emptyBoard(season.id, page, limit);
  const board = `${group}:individual`;
  const seasonStart = toDateOnly(season.start_date);
  const seasonEnd = toDateOnly(season.end_date);
  const offset = (page - 1) * limit;

  const [total, rawPage, updatedAt] = await Promise.all([
    rankingCache.getCount(season.id, board),
    rankingCache.getPage(season.id, board, offset, limit),
    rankingCache.getUpdatedAt(season.id, board),
  ]);

  let rankings = [];
  if (rawPage.length) {
    const runs = splitRuns(rawPage);
    const lastIndex = rawPage.length - 1;

    const rowBatches = await Promise.all(
      runs.map((run) => {
        if (run.startIndex !== 0 && run.endIndex !== lastIndex) {
          // 내부(경계 아님) 동점 구간 — 이미 완결된 그룹, 그대로 재정렬만
          const entries = rawPage.slice(run.startIndex, run.endIndex + 1).map((e) => ({
            member: e.member,
            score: e.score,
            rank: offset + run.startIndex + 1,
          }));
          return attachParticipation(entries, seasonStart, seasonEnd, season.total_days);
        }
        return resolveBoundaryRun(season.id, board, run.score, seasonStart, seasonEnd, season.total_days);
      })
    );

    const rowsByRank = new Map();
    rowBatches.flat().forEach((row) => {
      if (row.rank >= offset + 1 && row.rank <= offset + limit) rowsByRank.set(row.rank, row);
    });
    for (let r = offset + 1; r <= offset + limit; r++) {
      if (rowsByRank.has(r)) rankings.push(rowsByRank.get(r));
    }

    // 순위변동: 가장 최근 과거 스냅샷 대비. 양수=상승. 스냅샷 없으면(시즌 첫날 등) null
    const prevRanks = await rankingRepository.findPrevRanks(
      season.id, 'USER', rankings.map((r) => r.user_id), getEtDateString()
    );
    rankings = rankings.map((r) => ({
      ...r,
      rank_change: prevRanks.has(r.user_id) ? prevRanks.get(r.user_id) - r.rank : null,
    }));
  }

  return {
    season_id: season.id,
    school_group: group,
    updated_at: updatedAt ?? null,
    pagination: { page, limit, total },
    rankings,
  };
};

// GET /api/ranking/teams — 요청 유저의 그룹 리그만 조회
// 팀 동점 처리: 공동 순위(1224식) 유지 — 팀 참여율(팀원 출석 평균)은 소속 가중치·기록용이고,
// 팀 보드 자체의 동점 재정렬 기준으로는 쓰지 않는다(기획의 동점 재정렬 규칙은 개인 보드 대상).
// ZSET은 동점을 연속
// 배치하므로 페이지 첫 run만 이전 페이지에서 이어질 수 있어 countAbove로 시작 순위를 확정.
const getTeamLeaderboard = async (userId, { page = 1, limit = 20 } = {}) => {
  const season = await accountService.getOrCreateActiveSeason();
  const group = await resolveUserGroup(userId);
  if (!group) return emptyBoard(season.id, page, limit);
  const board = `${group}:team`;
  const offset = (page - 1) * limit;

  const [total, rawPage, updatedAt] = await Promise.all([
    rankingCache.getCount(season.id, board),
    rankingCache.getPage(season.id, board, offset, limit),
    rankingCache.getUpdatedAt(season.id, board),
  ]);

  let rankings = [];
  if (rawPage.length) {
    const runs = splitRuns(rawPage);
    const [firstAbove, profileMap] = await Promise.all([
      rankingCache.countAbove(season.id, board, runs[0].score),
      rankingRepository.findTeamProfiles(rawPage.map((e) => Number(e.member)), season.id),
    ]);

    const rankByIndex = computeCoRanks(rawPage, runs, offset, firstAbove);
    const prevRanks = await rankingRepository.findPrevRanks(
      season.id, 'TEAM', rawPage.map((e) => Number(e.member)), getEtDateString()
    );

    rankings = rawPage.map((e, i) => {
      const teamId = Number(e.member);
      const profile = profileMap.get(teamId);
      return {
        rank: rankByIndex[i],
        rank_change: prevRanks.has(teamId) ? prevRanks.get(teamId) - rankByIndex[i] : null,
        team_id: teamId,
        team_name: profile?.team_name ?? null,
        school_name: profile?.school_name ?? null,
        team_score: e.score,
        r_percent: profile?.r_percent ?? null,
        // alignment는 응답에 싣지 않는다 — 프론트 표시 요구 확정 시 additive로 추가 (non-breaking)
      };
    });
  }

  return {
    season_id: season.id,
    school_group: group,
    updated_at: updatedAt ?? null,
    pagination: { page, limit, total },
    rankings,
  };
};

// GET /api/ranking/schools?mode=individual|team — 요청 유저의 그룹 리그만 조회
// 소속(학교) 리더보드. org score는 recompute가 학교별 가중평균으로 미리 계산해 ZSET에 저장 —
// 조회는 팀 리더보드와 동일한 공동 순위(1224식). 단위: 개인 소속 %, 팀 소속 Point.
const getSchoolLeaderboard = async (userId, { mode = 'individual', page = 1, limit = 20 } = {}) => {
  const unit = mode === 'team' ? 'Point' : '%';
  const season = await accountService.getOrCreateActiveSeason();
  const group = await resolveUserGroup(userId);
  if (!group) return emptyBoard(season.id, page, limit, { mode, unit });
  const board = `${group}:${mode === 'team' ? 'school:team' : 'school:individual'}`;
  const offset = (page - 1) * limit;

  const [total, rawPage, updatedAt] = await Promise.all([
    rankingCache.getCount(season.id, board),
    rankingCache.getPage(season.id, board, offset, limit),
    rankingCache.getUpdatedAt(season.id, board),
  ]);

  let rankings = [];
  if (rawPage.length) {
    const runs = splitRuns(rawPage);
    const [firstAbove, profileMap] = await Promise.all([
      rankingCache.countAbove(season.id, board, runs[0].score),
      rankingRepository.findSchoolProfiles(rawPage.map((e) => Number(e.member))),
    ]);

    const rankByIndex = computeCoRanks(rawPage, runs, offset, firstAbove);
    const prevRanks = await rankingRepository.findPrevRanks(
      season.id,
      mode === 'team' ? 'SCHOOL_TEAM' : 'SCHOOL_INDIVIDUAL',
      rawPage.map((e) => Number(e.member)),
      getEtDateString()
    );

    rankings = rawPage.map((e, i) => {
      const schoolId = Number(e.member);
      return {
        rank: rankByIndex[i],
        rank_change: prevRanks.has(schoolId) ? prevRanks.get(schoolId) - rankByIndex[i] : null,
        school_id: schoolId,
        school_name: profileMap.get(schoolId) ?? null,
        score: e.score,
      };
    });
  }

  return {
    season_id: season.id,
    school_group: group,
    mode,
    unit,
    updated_at: updatedAt ?? null,
    pagination: { page, limit, total },
    rankings,
  };
};

// 내 소속(학교)의 특정 보드 순위 — 유저의 school_id 기준. 순위판 미등재(구성원 점수 없음·전원 미출석·
// skipped 보호)면 rank/score null로 내려 "학교는 있으나 아직 순위 없음"을 표현한다.
const resolveMySchoolRank = async (seasonId, board, targetType, schoolId, schoolName) => {
  const [rankInfo, total] = await Promise.all([
    rankingCache.getRank(seasonId, board, schoolId),
    rankingCache.getCount(seasonId, board),
  ]);
  if (!rankInfo) {
    return { school_id: schoolId, school_name: schoolName, rank: null, rank_change: null, score: null, total_schools: total };
  }
  const [above, prevRanks] = await Promise.all([
    rankingCache.countAbove(seasonId, board, rankInfo.score),
    rankingRepository.findPrevRanks(seasonId, targetType, [schoolId], getEtDateString()),
  ]);
  const rank = above + 1;
  return {
    school_id: schoolId,
    school_name: schoolName,
    rank,
    rank_change: prevRanks.has(schoolId) ? prevRanks.get(schoolId) - rank : null,
    score: rankInfo.score,
    total_schools: total,
  };
};

// GET /api/ranking/me (개인 + 팀 + 소속 2종)
//
// rankingCache.getRank의 ZREVRANK는 동점자를 Redis 멤버 순서(임의)로만 구분하므로,
// /individual 페이지가 보여주는 재정렬 결과와 어긋날 수 있다(예: 리더보드 1위인데 me는 3위로 나옴).
// → 동점 그룹 전체를 attachParticipation의 동일한 재정렬 로직에 태워 일관된 순위를 낸다.
const getMyRankingSummary = async (userId) => {
  const season = await accountService.getOrCreateActiveSeason();
  const seasonStart = toDateOnly(season.start_date);
  const seasonEnd = toDateOnly(season.end_date);

  const schoolByUser = await rankingRepository.findSchoolIdsByUserIds([Number(userId)]);
  const mySchoolId = schoolByUser.get(Number(userId));
  const group = mySchoolId == null ? null : await accountService.deriveSchoolGroup(mySchoolId);

  // 리그 미소속(학교 미설정) — 어느 보드에도 없으므로 전 섹션 null (프론트: 학교 설정 유도)
  if (!group) {
    return {
      season_id: season.id,
      school_group: null,
      individual: null,
      team: null,
      school_individual: null,
      school_team: null,
      total_participants: 0,
    };
  }
  const indivBoard = `${group}:individual`;
  const teamBoard = `${group}:team`;

  const [rankInfo, total, membership] = await Promise.all([
    rankingCache.getRank(season.id, indivBoard, userId),
    rankingCache.getCount(season.id, indivBoard),
    teamRepository.findMembershipByUserId(userId), // 무소속이면 null → team: null
  ]);

  let individual = null;
  if (rankInfo) {
    const [above, tiedMemberIds, prevRanks] = await Promise.all([
      rankingCache.countAbove(season.id, indivBoard, rankInfo.score),
      rankingCache.getMembersAtScore(season.id, indivBoard, rankInfo.score),
      rankingRepository.findPrevRanks(season.id, 'USER', [Number(userId)], getEtDateString()),
    ]);
    const tiedEntries = tiedMemberIds.map((m) => ({ member: m, score: rankInfo.score, rank: above + 1 }));
    const resolved = await attachParticipation(tiedEntries, seasonStart, seasonEnd, season.total_days);
    const mine = resolved.find((r) => r.user_id === Number(userId));
    individual = {
      rank: mine.rank,
      rank_change: prevRanks.has(Number(userId)) ? prevRanks.get(Number(userId)) - mine.rank : null,
      score: mine.score,
      active_days: mine.active_days,
      participation_ratio: mine.participation_ratio,
    };
  }

  // 팀 순위: 리더보드와 동일하게 공동 순위(countAbove+1)로 표기. 순위판에 아직 없으면(미계산·skipped
  // 신규 팀) 팀 정보만 내리고 rank/score는 null — 팀 자체가 없는 무소속과 구분된다.
  let team = null;
  if (membership) {
    const teamRank = await rankingCache.getRank(season.id, teamBoard, membership.team_id);
    const totalTeams = await rankingCache.getCount(season.id, teamBoard);
    if (teamRank) {
      const [above, profileMap, prevRanks] = await Promise.all([
        rankingCache.countAbove(season.id, teamBoard, teamRank.score),
        rankingRepository.findTeamProfiles([membership.team_id], season.id),
        rankingRepository.findPrevRanks(season.id, 'TEAM', [membership.team_id], getEtDateString()),
      ]);
      const rank = above + 1;
      team = {
        team_id: membership.team_id,
        team_name: membership.team_name,
        rank,
        rank_change: prevRanks.has(membership.team_id) ? prevRanks.get(membership.team_id) - rank : null,
        team_score: teamRank.score,
        r_percent: profileMap.get(membership.team_id)?.r_percent ?? null,
        total_teams: totalTeams,
      };
    } else {
      team = {
        team_id: membership.team_id,
        team_name: membership.team_name,
        rank: null,
        rank_change: null,
        team_score: null,
        r_percent: null,
        total_teams: totalTeams,
      };
    }
  }

  // 소속(학교) 2종 — 내 학교의 그룹 보드 내 순위
  const schoolName = (await rankingRepository.findSchoolProfiles([mySchoolId])).get(mySchoolId) ?? null;
  const [schoolIndividual, schoolTeam] = await Promise.all([
    resolveMySchoolRank(season.id, `${group}:school:individual`, 'SCHOOL_INDIVIDUAL', mySchoolId, schoolName),
    resolveMySchoolRank(season.id, `${group}:school:team`, 'SCHOOL_TEAM', mySchoolId, schoolName),
  ]);

  return {
    season_id: season.id,
    school_group: group,
    individual,
    team,
    school_individual: schoolIndividual,
    school_team: schoolTeam,
    total_participants: total,
  };
};

module.exports = {
  recomputeRankings,
  snapshotDailyRankings,
  getIndividualLeaderboard,
  getTeamLeaderboard,
  getSchoolLeaderboard,
  getMyRankingSummary,
};
