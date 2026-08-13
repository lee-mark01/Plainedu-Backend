# 랭킹(리그) — 도메인 & API 명세

> 시즌 기반 투자 리그의 순위 시스템. 개인·팀·소속(학교) 성과를 점수화해 4개 리더보드로 노출한다.
> Base path: `/api/ranking` · 전 라우트 🔒 인증 필수 · 공통 규약은 [api-conventions.md](api-conventions.md)

---

## 목차

1. [개념 정리](#1-개념-정리)
2. [4개 랭킹 한눈에](#2-4개-랭킹-한눈에)
3. [점수 산식](#3-점수-산식)
4. [순위는 어떻게·언제 갱신되나](#4-순위는-어떻게언제-갱신되나)
5. [API 목록](#5-api-목록)
6. [API 상세 (요청/응답)](#6-api-상세)
7. [응답 필드 주의점](#7-응답-필드-주의점)
8. [현재 상태 & 남은 작업](#8-현재-상태--남은-작업)
9. [팀이 결정해야 할 것 (Open Questions)](#9-팀이-결정해야-할-것)

---

## 1. 개념 정리

| 용어 | 뜻 |
|------|-----|
| **시즌(Season)** | 리그 1회차. 시작일~종료일·총 일수를 가진다. 현재 활성 시즌 1개 기준으로 모든 순위가 매겨진다. |
| **PersonalScore** | 개인 수익률(%). `(현재 평가금 − 초기 자금) / 초기 자금 × 100`. 개인 랭킹의 점수. |
| **TeamScore** | 팀 점수(Point). 수익률과 전략 준수도를 섞은 값. 팀 랭킹의 점수. |
| **Alignment** | 전략 준수도(0~100). 팀의 목표 비중 대비 실제 보유 비중 일치도. 포트폴리오 도메인이 계산. |
| **ParticipationRatio** | 참여율. `출석일 / 시즌 총일수` (0~1). 소속 랭킹의 가중치이자 개인 랭킹 동점 시 2차 기준. **팀의 출석일 = 팀원 출석일 평균** |
| **OrgScore** | 소속(학교) 점수. 학교 구성원 점수의 **참여율 가중평균**. |
| **소속(학교)** | 개인은 본인 학교(`Users.school_id`), 팀은 팀 학교(`Teams.school_id`) 기준. |

---

## 2. 4개 랭킹 한눈에

| 랭킹 | 평가 대상 | 단위 | 점수 = | 참여율 가중 |
|------|-----------|------|--------|:-----------:|
| **개인** | 개인 | % | PersonalScore (수익률) | ❌ (동점 2차 기준으로만) |
| **팀** | 팀 | Point | TeamScore | ❌ |
| **개인 소속** | 학교(개인 집합) | % | 학교 구성원 개인점수의 참여율 가중평균 | ✅ |
| **팀 소속** | 학교(팀 집합) | Point | 학교 소속 팀점수의 참여율 가중평균 | ✅ (팀 참여율 = 팀원 출석 평균 / 총일수) |

> **단위 주의**: 개인·개인소속은 **%**, 팀·팀소속은 **Point**. 프론트에서 섞어 표시하지 말 것. `/schools` 응답은 `unit` 필드로 단위를 함께 내려준다.

> **🏫 고교/대학 리그 완전 분리**: 모든 리더보드는 **HIGH_SCHOOL / UNIVERSITY 별도 리그**다 (보드 8개 = 그룹 2 × 4종). 그룹은 **서버가 요청 유저의 학교로 자동 판별** — 프론트는 그룹 선택 UI가 필요 없고, 응답의 `school_group` 필드로 현재 리그를 표시하면 된다. **학교 미설정 유저는 어느 리그에도 없다**: 리더보드는 빈 목록 + `school_group: null`, `/me`는 전 섹션 null → "학교를 설정하면 리그에 참여할 수 있어요" UI로 유도할 것.

---

## 3. 점수 산식

### PersonalScore (개인 수익률 %)

```
PersonalScore = (평가금액 − 초기자금) / 초기자금 × 100
```

- 초기자금 10만, 평가금액 10만 6,738원 → `+6.738%` → `6.7380` (소수 4자리)
- 파산(평가금 0) = **−100%** (특례 없음). 초기자금이 0 이하인 이상 데이터는 랭킹 제외.

### TeamScore (팀 점수 Point)

```
TeamScore = (R% × 0.9) + (Alignment × 0.1)   ← 소수 1자리
```

- R% = 팀 계좌 수익률(개인과 동일 산식). Alignment = 전략 준수도(0~100).
- 예: 수익률 0.67%, Alignment 100 → `0.67×0.9 + 100×0.1 = 10.6` Point.
- **Alignment 실계산**: 매주 **금요일 16:05 ET에 종가 기준으로 확정**해 `TeamAlignments`에 저장하고, 주중에는 그 값을 쓴다(기획: 주간 확정). **Active MP(모델포트폴리오) 없는 팀 = 0점** — 전략 미제출은 준수도 0. 첫 금요일 확정 전에는 MP 보유 팀도 일시적으로 0(최대 1주 과도기).

### ParticipationRatio (참여율)

```
ParticipationRatio = 시즌 기간 내 출석일 / 시즌 총일수     ← 0~1, 소수 4자리
```

- 출석일은 `Attendances` 테이블을 시즌 기간으로 집계(오늘까지만). 총일수는 시즌 `total_days`.

### OrgScore (소속 = 학교 점수)

```
OrgScore = Σ(구성원점수 × 참여율) / Σ(참여율)
```

- **가중평균**이지 단순평균이 아니다. 오래 참여한 구성원의 점수가 더 크게 반영된다.
- 개인 소속은 구성원=학생, 점수=PersonalScore, 가중치=참여율.
- 팀 소속은 구성원=팀, 점수=TeamScore, 가중치=**팀 참여율(팀원 출석일 평균/총일수)** — 2026-07-31 확정, 1 고정 폐기.
- **분모(Σ참여율)가 0인 학교는 순위에서 제외**된다(전원 미출석 등).

**worked example (개인 소속):** 학교 A에 학생 2명 — 갑(수익률 0.6738%, 출석 6일→참여율 0.0667), 을(0.3369%, 출석 14일→0.1556).
```
OrgScore_A = (0.6738×0.0667 + 0.3369×0.1556) / (0.0667+0.1556)
           = 0.0973641 / 0.2223 = 0.4380%
```
단순평균이라면 0.5054%였을 것 — 을(낮은 점수·높은 참여)이 더 무겁게 반영돼 아래로 당겨졌다.

---

## 4. 순위는 어떻게·언제 갱신되나

### 파이프라인 (recompute)

```
[recompute 실행]
   │
   ├─ 전 계좌 평가 (보유종목 × 현재가 → 평가금액·수익률)
   │     └─ 계좌 DB의 total_equity / current_return_rate 갱신(write-back)
   │
   └─ 점수 계산 → Redis 순위판(ZSET) 4종 갱신
         rank:{시즌}:individual / :team / :school:individual / :school:team
```

- 조회 API(`/individual` 등)는 이 **Redis 순위판을 읽기만** 한다. 순위판이 비어 있으면 빈 목록 + `updated_at: null`.
- **⚠️ 순위판은 recompute가 실행돼야 채워진다.** 서버 기동 시 1분 스케줄러가 자동으로 돌지만 **미국 정규장 중에만** 갱신된다. 장외·서버 첫 기동 직후엔 수동 트리거(`scripts/recompute-rankings.js`)로 채울 수 있다 — 프론트 연동 시 데이터가 비어 보이면 recompute 미실행 때문일 수 있다.

### "내 수익률"과 "랭킹 점수"는 계산 시점이 다르다

| | 어디서 | 언제 계산 |
|---|---|---|
| **내 계좌 수익률** (`GET /api/accounts/me`) | 홈·투자 화면 | **요청할 때마다 즉석 계산** (항상 최신, 순위판과 무관) |
| **랭킹 점수** (리더보드·`/ranking/me`) | 리그 화면 | **recompute 시점** 값 (마지막 갱신 시각 = `updated_at`) |

> 즉, 내 화면 수익률은 실시간이지만 리그 순위는 마지막 재계산 시점 기준이다. 프론트는 리더보드에 `updated_at`을 함께 노출하는 걸 권장.

### 시세 실패 시 (중요)

일부 종목의 현재가를 못 받아오면(외부 시세 API 실패·한도), 그 종목을 **가진 계좌는 이번 회차 순위 갱신에서 제외(skip)되고 직전 순위를 유지**한다. 잘못된 수익률로 순위를 덮어쓰지 않기 위함. 소속 랭킹도 마찬가지로, 제외된 구성원이 있는 학교는 직전 org score를 유지한다.

### 동점 처리

- **개인 랭킹**: 1차 점수 → 2차 참여율 → 3차 출석일 순으로 재정렬(스펙 규칙).
- **팀·소속 랭킹**: **공동 순위**로 표기한다 — 기획의 동점 재정렬 규칙(2차 참여율·3차 출석일)은 개인 보드 대상이고, 팀 참여율은 소속 가중치·기록용으로만 쓴다. 예) 같은 점수 두 팀은 둘 다 2위, 다음 팀은 4위(1-2-2-4식).

---

## 5. API 목록

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/ranking/individual?page=&limit=` | 개인 리더보드 (%) |
| GET | `/api/ranking/teams?page=&limit=` | 팀 리더보드 (Point) |
| GET | `/api/ranking/schools?mode=individual\|team&page=&limit=` | 소속(학교) 리더보드. `mode`로 개인/팀 소속 전환 |
| GET | `/api/ranking/me` | 내 순위 요약 (개인+팀+소속 2종 한 번에) |
| GET | `/api/ranking/me/history?season_id=&scope=` | 순위 추이 그래프 (지난 시즌 포함) |
| GET | `/api/ranking/seasons` | 시즌 목록 (지난 시즌 내비게이션) |
| GET | `/api/ranking/season` | 현재 시즌 기간·D-day |

- 공통 쿼리: `page`(기본 1), `limit`(기본 20, 최대 100). 범위 밖은 400.
- `mode`는 `individual`(기본) 또는 `team`. 그 외 값은 400.

---

## 6. API 상세

응답은 모두 `{ "success": true, "data": { ... } }` 봉투. 아래는 `data` 내용.

### GET /individual — 개인 리더보드

```json
{
  "season_id": 1,
  "school_group": "HIGH_SCHOOL",
  "updated_at": "2026-07-28T05:16:46.073Z",
  "pagination": { "page": 1, "limit": 20, "total": 42 },
  "rankings": [
    {
      "rank": 1,
      "rank_change": 2,
      "user_id": 1,
      "nickname": "홍길동",
      "school_name": "테스트고등학교",
      "score": 6.7382,
      "active_days": 6,
      "participation_ratio": 0.0667
    }
  ]
}
```
- `score` = PersonalScore(%). `school_name`은 학교 미설정 시 `null`.
- `rank_change` = 직전 스냅샷 대비 순위변동(양수=상승). 과거 스냅샷이 없으면(시즌 첫날 등) `null`.

### GET /teams — 팀 리더보드

```json
{
  "season_id": 1,
  "school_group": "HIGH_SCHOOL",
  "updated_at": "2026-07-28T05:16:46.073Z",
  "pagination": { "page": 1, "limit": 20, "total": 3 },
  "rankings": [
    {
      "rank": 1,
      "rank_change": null,
      "team_id": 4,
      "team_name": "검증팀A",
      "school_name": "테스트고등학교",
      "team_score": 10.6,
      "r_percent": 0.6738
    }
  ]
}
```
- `team_score`(Point) = `R%×0.9 + Alignment×0.1`. Alignment는 주간(금요일 종가) 확정값, MP 없는 팀은 0 (§3). **`alignment` 필드는 응답에 아직 없다** — 프론트 표시 요구가 확정되면 additive로 추가(non-breaking).
- **`?school_id=`** 를 붙이면 그 학교의 참여팀만 반환한다(소속 리더보드에서 학교를 눌렀을 때). 이때 `rank`는 **학교 내 등수가 아니라 리그 전체 순위**를 유지하고(화면의 정보는 "우리 학교 A팀이 전체 몇 위인가"), `pagination.total`은 필터 후 팀 수다. 응답 최상위에 `school_id`가 추가된다.

### GET /schools?mode=individual|team — 소속 리더보드

```json
{
  "season_id": 1,
  "school_group": "HIGH_SCHOOL",
  "mode": "team",
  "unit": "Point",
  "updated_at": "2026-07-28T05:16:46.073Z",
  "pagination": { "page": 1, "limit": 20, "total": 2 },
  "rankings": [
    { "rank": 1, "rank_change": 0, "school_id": 1, "school_name": "테스트고등학교", "score": 10.3 },
    { "rank": 2, "rank_change": null, "school_id": 2, "school_name": "테스트대학교", "score": 10 }
  ]
}
```
- `mode=individual` → `unit: "%"`, `mode=team` → `unit: "Point"`. `score`의 단위는 항상 `unit` 필드를 따른다.

### GET /me — 내 순위 요약

```json
{
  "season_id": 1,
  "school_group": "HIGH_SCHOOL",
  "individual": {
    "rank": 1, "rank_change": 2, "score": 6.7382, "active_days": 6, "participation_ratio": 0.0667
  },
  "team": {
    "team_id": 4, "team_name": "검증팀A", "rank": 1, "rank_change": null,
    "team_score": 10.6, "r_percent": 0.6738, "total_teams": 3
  },
  "school_individual": {
    "school_id": 1, "school_name": "테스트고등학교", "rank": 1, "rank_change": 0, "score": 0.438, "total_schools": 1
  },
  "school_team": {
    "school_id": 1, "school_name": "테스트고등학교", "rank": 1, "rank_change": null, "score": 10.3, "total_schools": 2
  },
  "total_participants": 42
}
```
- **`team`은 무소속이면 `null`.** `school_individual`/`school_team`은 학교 미설정이면 `null`.
- 학교는 있으나 아직 순위판에 안 오른 경우(예: 구성원 전원 미출석) → 객체는 오되 `rank`/`score`가 `null`. "무학교(전체 null)"와 "학교는 있으나 순위 없음(rank만 null)"을 구분할 것.
- **팀도 동일 패턴**: 소속 팀은 있으나 순위판 미등재(미계산·skipped 신규 팀)면 `team` 객체는 오되 `rank`/`team_score`/`r_percent`가 `null`. `team !== null`만 보고 `rank`를 쓰지 말 것.
- **`rank_change`는 4개 섹션 전부 포함** (2026-07-28 추가) — 의미는 리더보드와 동일(§7). 순위판 미등재(`rank: null`)면 `rank_change`도 `null`. `updated_at`은 /me에 없음(리더보드 참조).

### GET /me/history — 순위 추이 (그래프)

지난 시즌 결과 화면의 **순위 선그래프**용. 라이브 ZSET에는 "오늘 값" 하나뿐이라 추이가 없어서, 영구 기록인 `DailyRankings`(평일 16:05 ET 스냅샷)를 읽는다 — **시즌이 끝나도 남는다**.

```json
{
  "season_id": 2,
  "season_name": "2026년 2분기",
  "scope": "individual",
  "school_group": "HIGH_SCHOOL",
  "target_id": 1,
  "items": [
    { "date": "2026-04-01", "rank": 1800, "total": 1900, "score": 0.0,  "return_rate": 0.0 },
    { "date": "2026-06-30", "rank": 3,    "total": 1284, "score": 8.42, "return_rate": 8.42 }
  ]
}
```

- `scope`: `individual` · `team` · `school_individual` · `school_team` (기본 `individual`) → 각각 `DailyRankings.target_type`의 `USER`/`TEAM`/`SCHOOL_INDIVIDUAL`/`SCHOOL_TEAM`.
- `season_id` 생략 시 현재 시즌. 지난 시즌 id는 `/seasons`에서 얻는다.
- `total` = 그날 **같은 리그**의 모수 → `rank / total`로 "상위 N%".
- **수익률 선그래프는 이 API가 아니라 `/api/accounts/me/history?season_id=`** 를 쓴다(자산 스냅샷이 더 촘촘하고 금액도 준다). 둘을 겹치면 디자인의 2선 차트가 된다.
- 대상이 없으면 빈 `items` + 200: 학교 미설정(`school_group: null`) · `scope=team`인데 팀 미소속(`target_id: null`).

### GET /seasons — 시즌 목록

지난 시즌 화살표 내비게이션용. 최신순.

```json
{
  "seasons": [
    { "season_id": 3, "name": "2026년 3분기", "start_date": "2026-07-01", "end_date": "2026-09-30", "total_days": 92, "status": "ACTIVE", "is_current": true },
    { "season_id": 2, "name": "2026년 2분기", "start_date": "2026-04-01", "end_date": "2026-06-30", "total_days": 91, "status": "COMPLETED", "is_current": false }
  ]
}
```

### GET /season — 시즌 정보

```json
{
  "season_id": 3,
  "name": "2026년 3분기",
  "start_date": "2026-07-01",
  "end_date": "2026-09-30",
  "total_days": 92,
  "status": "ACTIVE",
  "d_day": 48
}
```
- `d_day` = 오늘부터 종료일까지 남은 일수.
- 시즌은 **분기 단위**(연 4회)다: 1/4/7/10월 1일 시작 ~ 그 분기 마지막 날 종료. `total_days`는 분기 길이라 90~92로 달라지며, 그대로 참여율(ParticipationRatio)의 분모가 된다.
- 종료일이 지나면 다음 조회 요청에서 자동으로 다음 분기 시즌으로 전환된다(§8 시즌 전환).

---

## 7. 응답 필드 주의점

- **`updated_at`**: 순위판 마지막 갱신 시각(ISO). recompute가 안 돌았으면 `null`. 리더보드에 "N분 전 기준" 표시 재료.
- **`school_group`**: 전 응답 최상위에 포함 — 이 응답이 어느 리그(HIGH_SCHOOL/UNIVERSITY)인지. `null`이면 유저가 학교 미설정 → 리그 미참여 상태(빈 보드/전 섹션 null)이니 학교 설정 유도 UI를 보여줄 것.
- **`rank_change`**: 리더보드 3종 각 행 + `/me` 4개 섹션에 포함. "가장 최근 과거 스냅샷"(보통 전 거래일 16:05 ET) 대비 순위변동 — 양수=상승, 음수=하락, `0`=변동 없음, `null`=비교할 과거 스냅샷 없음(시즌 첫날·신규 진입). 주말·공휴일을 건너뛰고 직전 거래일과 비교한다.
- **`null` 순위**: `/me`에서 `rank: null`은 "대상은 있으나 아직 순위 없음". 전체 필드가 `null`이면 "대상 자체 없음(무소속·무학교)".
- **`total`/`total_participants`/`total_schools`**: 각 보드의 전체 모수. 페이지네이션·"상위 몇 %" 계산용.
- **점수 자릿수**: 개인/개인소속 % 소수 4자리, 팀/팀소속 Point 소수 1자리. (Redis 특성상 `10.30`은 `10.3`으로, `0.4380`은 `0.438`로 뒤 0이 잘려 올 수 있음 — 숫자값으로 처리할 것.)

---

## 8. 현재 상태 & 남은 작업

**구현 완료**:
- 개인·팀·소속 2종 리더보드, `/me`, `/season`
- 점수 산식(개인·팀·소속), 참여율, 시세 실패 시 순위 보존, 동점 처리
- **1분 자동 스케줄러**: 서버 기동 시 자동 시작, 미국 정규장 중 1분마다 recompute → 라이브 순위판 갱신. 장외·활성 시즌 없음·직전 실행 미완료 시 skip.
- **일일 스냅샷**: 평일 16:05 ET(마감 5분 후) 최종 recompute → `DailyRankings`·`AccountAssetHistories` 기록(멱등 UPSERT) + 리더보드 `rank_change` 제공. **금요일에는 Alignment 주간 확정을 먼저 수행** 후 재계산해 그날 점수·스냅샷에 즉시 반영. `alignment_score`는 확정값(MP 없으면 NULL), TEAM `participation_rate`는 팀원 출석 평균 기반 실값, 학교는 NULL.

**주의**:
- 스냅샷은 미국 공휴일(휴장일)에도 실행된다(marketHours가 공휴일 미반영) — 그날은 가격 변동 없는 평탄한 스냅샷 1행이 쌓일 뿐 무해. 공휴일 가드는 후속 작업.
- **배포 전제**: 마이그레이션 `20260728000001`(participation_rate NULLable)이 **코드 배포보다 먼저** 적용돼야 한다. 미적용 상태에서 첫 스냅샷은 TEAM/SCHOOL 행의 NULL insert로 전면 실패한다(그날 기록 0행).
- **DailyRankings 컬럼 의미는 target_type에 따라 다르다**: `return_rate`는 USER·SCHOOL_INDIVIDUAL=%(수익률), TEAM=R%, SCHOOL_TEAM=**Point(final_score와 동일값)** — NOT NULL 제약상의 타협. 이 테이블을 소비할 때 target_type별 단위 분기 필수.
- **시즌 전환**: `getOrCreateActiveSeason`이 담당한다 — 종료일이 지난 시즌은 다음 조회 요청에서 `COMPLETED`로 닫히고, **오늘이 속한 분기 시즌**(1/4/7/10월 1일 ~ 분기 말일, 이름 `"2026년 3분기"`)이 열린다. 모든 조회 경로가 이 함수를 지나므로 전용 스케줄러가 없다. 계좌 초기화도 코드가 없다 — 계좌가 `season_id`별이라 새 시즌 첫 접근 때 `initial_cash`로 새로 생성된다. 운영자가 시즌을 앞당겨 끝내려면 `end_date`만 과거로 바꾸면 된다.
  - **동시성**: 만료 직후 여러 요청이 동시에 전환을 시도해도 시즌은 하나만 생긴다. `Seasons`에 `uq_seasons_single_active`(생성 컬럼 UNIQUE — `status='ACTIVE'`인 행 최대 1개)가 걸려 있어 DB가 강제하고, 경합에서 진 요청은 승자가 만든 시즌을 다시 읽는다. **마이그레이션 `20260813000001` 적용 필수** (미적용 시 트래픽이 몰리는 전환 순간에 ACTIVE 시즌이 갈라져 계좌·랭킹이 쪼개질 수 있다).
  - 닫기와 생성 사이에서 실패해 ACTIVE가 0개가 되어도 다음 요청이 스스로 복구한다(self-healing) — 트랜잭션 불필요.
  - 스케줄러/스냅샷은 여전히 시즌을 생성하지 않고 skip한다(`getActiveSeason`). 분기 경계 자정~첫 요청 사이에는 만료된 시즌 기준으로 ZSET이 갱신될 수 있으나, 최종 성적은 `DailyRankings`(종료일 스냅샷)에서 읽으므로 영향 없다.
  - 이전 시즌의 Redis ZSET은 TTL 없이 잔존 — 용량상 무해하나 정리 잡은 없다.
- **수동 트리거**: recompute는 `node scripts/recompute-rankings.js`, 스냅샷 재실행(크론 실패한 날 복구)은 `node scripts/run-daily-snapshot.js` — 둘 다 멱등.


---

> 이 문서는 랭킹 도메인의 단일 참조본이다. API를 추가·변경하면 이 문서와 [api-catalog.md](api-catalog.md)를 같은 PR에서 갱신한다.
