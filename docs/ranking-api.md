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
| **ParticipationRatio** | 참여율. `출석일 / 시즌 총일수` (0~1). 소속 랭킹의 가중치이자 개인 랭킹 동점 시 2차 기준. |
| **OrgScore** | 소속(학교) 점수. 학교 구성원 점수의 **참여율 가중평균**. |
| **소속(학교)** | 개인은 본인 학교(`Users.school_id`), 팀은 팀 학교(`Teams.school_id`) 기준. |

---

## 2. 4개 랭킹 한눈에

| 랭킹 | 평가 대상 | 단위 | 점수 = | 참여율 가중 |
|------|-----------|------|--------|:-----------:|
| **개인** | 개인 | % | PersonalScore (수익률) | ❌ (동점 2차 기준으로만) |
| **팀** | 팀 | Point | TeamScore | ❌ |
| **개인 소속** | 학교(개인 집합) | % | 학교 구성원 개인점수의 참여율 가중평균 | ✅ |
| **팀 소속** | 학교(팀 집합) | Point | 학교 소속 팀점수의 평균 | ✅ (팀 참여율은 현재 1 고정) |

> **단위 주의**: 개인·개인소속은 **%**, 팀·팀소속은 **Point**. 프론트에서 섞어 표시하지 말 것. `/schools` 응답은 `unit` 필드로 단위를 함께 내려준다.

> **⚠️ 고교/대학 통합 상태**: 현재 모든 리더보드는 고등학생·대학생 **통합 1개**다. 그룹 분리(HIGH_SCHOOL/UNIVERSITY)는 기획 요구로 확인됐으나(2026-07-28) 미결정 사항이 남아 후속 작업 — §9 Open Q 4 참조. 프론트는 분리 UI를 먼저 만들지 말 것.

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
- **주의**: Alignment는 현재 **스텁 100 고정**이다(아래 §9 참조). 그래서 지금은 사실상 모든 팀이 `R%×0.9 + 10`.

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
- 팀 소속은 구성원=팀, 점수=TeamScore, 가중치=1 고정 → 결과적으로 **팀점수 단순평균**.
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
- **⚠️ 순위판은 recompute가 실행돼야 채워진다.** 서버 기동 시 1분 스케줄러(Task 7)가 자동으로 돌지만 **미국 정규장 중에만** 갱신된다. 장외·서버 첫 기동 직후엔 수동 트리거(`scripts/recompute-rankings.js`)로 채울 수 있다 — 프론트 연동 시 데이터가 비어 보이면 recompute 미실행 때문일 수 있다.

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
- **팀·소속 랭킹**: 참여율 2차 기준이 성립하지 않아(팀 참여율 1 고정 등) **공동 순위**로 표기한다. 예) 같은 점수 두 팀은 둘 다 2위, 다음 팀은 4위(1-2-2-4식).

---

## 5. API 목록

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/ranking/individual?page=&limit=` | 개인 리더보드 (%) |
| GET | `/api/ranking/teams?page=&limit=` | 팀 리더보드 (Point) |
| GET | `/api/ranking/schools?mode=individual\|team&page=&limit=` | 소속(학교) 리더보드. `mode`로 개인/팀 소속 전환 |
| GET | `/api/ranking/me` | 내 순위 요약 (개인+팀+소속 2종 한 번에) |
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
- `team_score`(Point) = `R%×0.9 + Alignment×0.1`. **`alignment` 필드는 응답에 없다** — 현재 스텁 100(§9 Open Q 1)이라 실측처럼 노출하지 않는다. 실계산 연결 시 필드 추가 예정(additive라 non-breaking).

### GET /schools?mode=individual|team — 소속 리더보드

```json
{
  "season_id": 1,
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

### GET /season — 시즌 정보

```json
{
  "season_id": 1,
  "name": "2026 자동생성 시즌",
  "start_date": "2026-07-12",
  "end_date": "2026-10-09",
  "total_days": 90,
  "status": "ACTIVE",
  "d_day": 73
}
```
- `d_day` = 오늘부터 종료일까지 남은 일수.

---

## 7. 응답 필드 주의점

- **`updated_at`**: 순위판 마지막 갱신 시각(ISO). recompute가 안 돌았으면 `null`. 리더보드에 "N분 전 기준" 표시 재료.
- **`rank_change`**: 리더보드 3종 각 행 + `/me` 4개 섹션에 포함. "가장 최근 과거 스냅샷"(보통 전 거래일 16:05 ET) 대비 순위변동 — 양수=상승, 음수=하락, `0`=변동 없음, `null`=비교할 과거 스냅샷 없음(시즌 첫날·신규 진입). 주말·공휴일을 건너뛰고 직전 거래일과 비교한다.
- **`null` 순위**: `/me`에서 `rank: null`은 "대상은 있으나 아직 순위 없음". 전체 필드가 `null`이면 "대상 자체 없음(무소속·무학교)".
- **`total`/`total_participants`/`total_schools`**: 각 보드의 전체 모수. 페이지네이션·"상위 몇 %" 계산용.
- **점수 자릿수**: 개인/개인소속 % 소수 4자리, 팀/팀소속 Point 소수 1자리. (Redis 특성상 `10.30`은 `10.3`으로, `0.4380`은 `0.438`로 뒤 0이 잘려 올 수 있음 — 숫자값으로 처리할 것.)

---

## 8. 현재 상태 & 남은 작업

**구현 완료**:
- 개인·팀·소속 2종 리더보드, `/me`, `/season`
- 점수 산식(개인·팀·소속), 참여율, 시세 실패 시 순위 보존, 동점 처리
- **1분 자동 스케줄러** (Task 7): 서버 기동 시 자동 시작, 미국 정규장 중 1분마다 recompute → 라이브 순위판 갱신. 장외·활성 시즌 없음·직전 실행 미완료 시 skip.
- **일일 스냅샷** (Task 8): 평일 16:05 ET(마감 5분 후) 최종 recompute → `DailyRankings`·`AccountAssetHistories` 기록(멱등 UPSERT) + 리더보드 `rank_change` 제공. `alignment_score`·팀/학교 `participation_rate`는 실계산 확정 전까지 `NULL`(스텁을 영구 기록하지 않음).

**주의**:
- 스냅샷은 미국 공휴일(휴장일)에도 실행된다(marketHours가 공휴일 미반영) — 그날은 가격 변동 없는 평탄한 스냅샷 1행이 쌓일 뿐 무해. 공휴일 가드는 후속 작업.
- **배포 전제**: 마이그레이션 `20260728000001`(participation_rate NULLable)이 **코드 배포보다 먼저** 적용돼야 한다. 미적용 상태에서 첫 스냅샷은 TEAM/SCHOOL 행의 NULL insert로 전면 실패한다(그날 기록 0행).
- **DailyRankings 컬럼 의미는 target_type에 따라 다르다**: `return_rate`는 USER·SCHOOL_INDIVIDUAL=%(수익률), TEAM=R%, SCHOOL_TEAM=**Point(final_score와 동일값)** — NOT NULL 제약상의 타협. 이 테이블을 소비할 때 target_type별 단위 분기 필수.
- **시즌 전환 주의**: 조회 API는 활성 시즌이 없으면 `getOrCreateActiveSeason`으로 **자동 생성**하지만, 스케줄러/스냅샷은 생성하지 않고 skip한다. 시즌을 종료(status 변경)한 뒤 방치하면 다음 GET 요청 하나가 "자동생성 시즌"을 몰래 개시할 수 있다 — 시즌 종료 시 곧바로 다음 시즌을 명시적으로 생성해 둘 것. (이전 시즌의 Redis ZSET은 TTL 없이 잔존 — 용량상 무해하나 정리 잡 없음)
- **수동 트리거**: recompute는 `node scripts/recompute-rankings.js`, 스냅샷 재실행(크론 실패한 날 복구)은 `node scripts/run-daily-snapshot.js` — 둘 다 멱등.

---

## 9. 팀이 결정해야 할 것 (Open Questions)

| # | 안건 | 현재 뼈대 처리 | 필요한 결정 |
|---|------|----------------|-------------|
| 1 | **Alignment 실계산 시점** | 스텁 **100 고정** | 포트폴리오의 Alignment는 "매주 금요일 종가" 기준이 기획인데, 그 가격 스냅샷을 누가 언제 찍을지 미정. 결정 전까지 팀 점수는 사실상 수익률만 반영. |
| 2 | **미인증 학교 소속** | 미인증 유저도 학교 평균에 **포함** | `Users.school_is_verified=0`(학교 미인증) 유저를 소속 랭킹 집계에서 뺄지. 공정성 이슈 — 뺄 거면 백엔드 한 줄로 처리 가능. |
| 3 | **팀 참여율 정의** | **1 고정** | ~~미정~~ **방향 확정(2026-07-28): 팀 참여율도 출석일 기반.** 남은 세부: 팀원 출석을 어떻게 합치나(평균? 전원 출석한 날만? 대표자?) — 집계식 확정되면 calculator 입력만 교체(코드 준비됨). |
| 4 | **고교/대학 그룹 분리** | 전 보드 **통합 1개** | 개인·팀(·소속) 리더보드를 HIGH_SCHOOL/UNIVERSITY로 나누기 — **기획 요구 확인됨(2026-07-28), 후속 작업.** 코드 전 결정 필요: ① `school_group` NULL(학교 미인증) 유저는 어느 보드? ② 통합 보드("전체 1위")도 유지? ③ 스냅샷·rank_change도 그룹별로(DailyRankings 컬럼 추가 필요). 설계상 순위판 키에 그룹 suffix 추가로 확장 가능한 구조. |

---

> 이 문서는 랭킹 도메인의 단일 참조본이다. API를 추가·변경하면 이 문서와 [api-catalog.md](api-catalog.md)를 같은 PR에서 갱신한다.
