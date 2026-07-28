// 랭킹 파이프라인 오케스트레이션 (스펙 §7: valuation 배치 → 점수 → Redis 순위판)
// 개인 · 팀 · 소속 2종(개인/팀) 순위판
const AppError = require('../../errors/AppError');
const { getEtDateString } = require('../../config/marketHours');
const accountService = require('../account/account.service');
const { valuateSeasonAccounts } = require('../account/account.valuation');
const teamRepository = require('../team/team.repository');
const rankingCache = require('./ranking.cache');
const rankingRepository = require('./ranking.repository');
const { participationRatio, teamScore, orgWeightedScore } = require('./ranking.calculator');

// Alignment 스텁 (스펙 §3): 매주 금요일 종가 스냅샷 주체가 미결(스펙 Open Q 4)이라 100 고정.
// 결정되면 portfolio.alignment.calculateAlignment + 금요일 가격 스냅샷 재료로 교체 —
// 실시간 현재가 계산으로 대체하지 말 것(기획은 주간 스냅샷 기준).
const getAlignmentScore = (_teamId) => 100;

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

// 팀 소속: 학교별 Σ(TeamScore × 1)/Σ(1) = 팀점수 단순평균 (Point 1자리, 팀 참여율 1 고정 — Open Q 1).
const buildTeamSchoolEntries = async (teamEntries, skippedTeams) => {
  const freshTeamIds = teamEntries.map((e) => e.member);
  const skippedTeamIds = skippedTeams.map((s) => s.team_id);
  const allTeamIds = [...new Set([...freshTeamIds, ...skippedTeamIds])];

  const schoolByTeam = await rankingRepository.findSchoolIdsByTeamIds(allTeamIds);

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
    membersBySchool.get(schoolId).push({ score: e.score, ratio: 1 });
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

  // 개인
  const indivResults = results.filter((r) => r.account_type === 'INDIVIDUAL' && r.return_rate != null);
  const entries = indivResults.map((r) => ({ member: r.user_id, score: r.return_rate }));
  const skippedIndiv = skipped.filter((s) => s.account_type === 'INDIVIDUAL');
  const protectedMembers = new Set(skippedIndiv.map((s) => String(s.user_id)));

  // 팀: TeamScore = R%×0.9 + Alignment×0.1 (스펙 §3). R%는 valuation의 return_rate 그대로
  const teamEntries = results
    .filter((r) => r.account_type === 'TEAM' && r.team_id != null && r.return_rate != null)
    .map((r) => ({ member: r.team_id, score: teamScore(r.return_rate, getAlignmentScore(r.team_id)) }))
    .filter((e) => e.score != null);
  const skippedTeams = skipped.filter((s) => s.account_type === 'TEAM' && s.team_id != null);
  const protectedTeams = new Set(skippedTeams.map((s) => String(s.team_id)));

  // 소속 2종 (school_id 조인 + 개인 참여율 가중) — DB 조회가 있어 병렬
  const [schoolIndiv, schoolTm] = await Promise.all([
    buildIndividualSchoolEntries(indivResults, skippedIndiv, seasonStart, seasonEnd, season.total_days),
    buildTeamSchoolEntries(teamEntries, skippedTeams),
  ]);

  const [individual, team, schoolIndividual, schoolTeam] = await Promise.all([
    rankingCache.syncBoard(targetSeasonId, 'individual', entries, { protectedMembers, updatedAt: valuated_at }),
    rankingCache.syncBoard(targetSeasonId, 'team', teamEntries, { protectedMembers: protectedTeams, updatedAt: valuated_at }),
    rankingCache.syncBoard(targetSeasonId, 'school:individual', schoolIndiv.entries, {
      protectedMembers: schoolIndiv.protectedSchools,
      updatedAt: valuated_at,
    }),
    rankingCache.syncBoard(targetSeasonId, 'school:team', schoolTm.entries, {
      protectedMembers: schoolTm.protectedSchools,
      updatedAt: valuated_at,
    }),
  ]);

  return {
    season_id: targetSeasonId,
    valuated_at,
    individual: { ...individual, skipped: protectedMembers.size },
    team: { ...team, skipped: protectedTeams.size },
    school_individual: { ...schoolIndividual, protected: schoolIndiv.protectedSchools.size },
    school_team: { ...schoolTeam, protected: schoolTm.protectedSchools.size },
    // 일일 스냅샷이 AccountAssetHistories를 같은 배치 시점 값으로 기록할 수 있도록
    // 계좌별 평가 결과를 함께 반환 (skipped 계좌는 신선한 값이 없으므로 미포함)
    accounts: results.map((r) => ({
      account_id: r.account_id,
      total_equity: r.total_equity,
      return_rate: r.return_rate ?? 0, // write-back과 동일한 NOT NULL 방어
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
// AccountAssetHistories 기록. rank_date는 ET 거래일(getEtDateString) 기준으로 멱등.
// alignment_score는 실계산(Open Q4) 전까지 NULL, participation_rate는 개인만 실값(팀 Open Q 1·학교는
// 정의 없음 → NULL) — 스텁을 영구 기록하지 않는다 (2026-07-28 결정).
const snapshotDailyRankings = async () => {
  // 패시브 잡: 활성 시즌 없으면 생성하지 않고 skip (스케줄러와 동일 정책)
  const season = await accountService.getActiveSeason();
  if (!season) return null;
  const seasonStart = toDateOnly(season.start_date);
  const seasonEnd = toDateOnly(season.end_date);

  // 마감 시점 최종 숫자 확정 → 이 결과(ZSET·write-back·accounts)가 스냅샷 재료
  const recompute = await recomputeRankings(season.id);
  const rankDate = getEtDateString();

  const [indivAll, teamAll, schoolIndivAll, schoolTeamAll] = await Promise.all([
    rankingCache.getAllEntries(season.id, 'individual'),
    rankingCache.getAllEntries(season.id, 'team'),
    rankingCache.getAllEntries(season.id, 'school:individual'),
    rankingCache.getAllEntries(season.id, 'school:team'),
  ]);

  const rows = [];
  const base = { season_id: season.id, rank_date: rankDate, alignment_score: null };

  // USER: API와 동일한 동점 재정렬(2차 참여율·3차 출석일)로 전체 순위 확정 — 페이지가 보여주는 순위와 일치
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
    const profiles = await rankingRepository.findTeamProfiles(teamIds, season.id);
    const ranks = coRankAll(teamAll);
    teamAll.forEach((e, i) => {
      const teamId = Number(e.member);
      rows.push({
        ...base,
        target_type: 'TEAM',
        target_id: teamId,
        rank_position: ranks[i],
        return_rate: profiles.get(teamId)?.r_percent ?? 0, // 컬럼 NOT NULL 방어 (계좌 미생성 팀은 이론상 보드 미등재)
        final_score: e.score,
        participation_rate: null, // 팀 참여율 정의 미정(Open Q 1) — 스텁 1을 영구 기록하지 않음
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
const resolveBoundaryRun = (seasonId, score, seasonStart, seasonEnd, seasonDays) =>
  Promise.all([
    rankingCache.countAbove(seasonId, 'individual', score),
    rankingCache.getMembersAtScore(seasonId, 'individual', score),
  ]).then(([above, memberIds]) => {
    const entries = memberIds.map((m) => ({ member: m, score, rank: above + 1 }));
    return attachParticipation(entries, seasonStart, seasonEnd, seasonDays);
  });

// GET /api/ranking/individual
const getIndividualLeaderboard = async ({ page = 1, limit = 20 } = {}) => {
  const season = await accountService.getOrCreateActiveSeason();
  const seasonStart = toDateOnly(season.start_date);
  const seasonEnd = toDateOnly(season.end_date);
  const offset = (page - 1) * limit;

  const [total, rawPage, updatedAt] = await Promise.all([
    rankingCache.getCount(season.id, 'individual'),
    rankingCache.getPage(season.id, 'individual', offset, limit),
    rankingCache.getUpdatedAt(season.id, 'individual'),
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
        return resolveBoundaryRun(season.id, run.score, seasonStart, seasonEnd, season.total_days);
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
    updated_at: updatedAt ?? null,
    pagination: { page, limit, total },
    rankings,
  };
};

// GET /api/ranking/teams
// 팀 동점 처리: 참여율이 1 고정(스펙 Open Q 1)이라 개인식 2차 재정렬 근거가 없음 →
// 재정렬 대신 "같은 점수 = 같은 순위"(공동 순위, 1224식)로 표기한다. ZSET은 동점을 연속
// 배치하므로 페이지 첫 run만 이전 페이지에서 이어질 수 있어 countAbove로 시작 순위를 확정.
const getTeamLeaderboard = async ({ page = 1, limit = 20 } = {}) => {
  const season = await accountService.getOrCreateActiveSeason();
  const offset = (page - 1) * limit;

  const [total, rawPage, updatedAt] = await Promise.all([
    rankingCache.getCount(season.id, 'team'),
    rankingCache.getPage(season.id, 'team', offset, limit),
    rankingCache.getUpdatedAt(season.id, 'team'),
  ]);

  let rankings = [];
  if (rawPage.length) {
    const runs = splitRuns(rawPage);
    const [firstAbove, profileMap] = await Promise.all([
      rankingCache.countAbove(season.id, 'team', runs[0].score),
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
        // alignment는 응답에 싣지 않는다 — 산식(teamScore)에는 포함되지만 아직 스텁 100이라
        // 실측처럼 노출하지 않음. 실계산(Open Q 4) 연결 시 필드 추가 (additive라 non-breaking)
      };
    });
  }

  return {
    season_id: season.id,
    updated_at: updatedAt ?? null,
    pagination: { page, limit, total },
    rankings,
  };
};

// GET /api/ranking/schools?mode=individual|team
// 소속(학교) 리더보드. org score는 recompute가 학교별 가중평균으로 미리 계산해 ZSET에 저장 —
// 조회는 팀 리더보드와 동일한 공동 순위(1224식). 단위: 개인 소속 %, 팀 소속 Point.
const getSchoolLeaderboard = async ({ mode = 'individual', page = 1, limit = 20 } = {}) => {
  const board = mode === 'team' ? 'school:team' : 'school:individual';
  const unit = mode === 'team' ? 'Point' : '%';
  const season = await accountService.getOrCreateActiveSeason();
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

  const [rankInfo, total, membership, schoolByUser] = await Promise.all([
    rankingCache.getRank(season.id, 'individual', userId),
    rankingCache.getCount(season.id, 'individual'),
    teamRepository.findMembershipByUserId(userId), // 무소속이면 null → team: null
    rankingRepository.findSchoolIdsByUserIds([Number(userId)]), // 학교 미설정이면 소속 필드 null
  ]);

  let individual = null;
  if (rankInfo) {
    const [above, tiedMemberIds, prevRanks] = await Promise.all([
      rankingCache.countAbove(season.id, 'individual', rankInfo.score),
      rankingCache.getMembersAtScore(season.id, 'individual', rankInfo.score),
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
    const teamRank = await rankingCache.getRank(season.id, 'team', membership.team_id);
    const totalTeams = await rankingCache.getCount(season.id, 'team');
    if (teamRank) {
      const [above, profileMap, prevRanks] = await Promise.all([
        rankingCache.countAbove(season.id, 'team', teamRank.score),
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

  // 소속(학교) 2종 — 유저의 school_id 기준. 미설정이면 둘 다 null.
  let schoolIndividual = null;
  let schoolTeam = null;
  const schoolId = schoolByUser.get(Number(userId));
  if (schoolId != null) {
    const schoolName = (await rankingRepository.findSchoolProfiles([schoolId])).get(schoolId) ?? null;
    [schoolIndividual, schoolTeam] = await Promise.all([
      resolveMySchoolRank(season.id, 'school:individual', 'SCHOOL_INDIVIDUAL', schoolId, schoolName),
      resolveMySchoolRank(season.id, 'school:team', 'SCHOOL_TEAM', schoolId, schoolName),
    ]);
  }

  return {
    season_id: season.id,
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
