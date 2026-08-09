# 모델포트폴리오(MP) — API 명세

> 팀원이 함께 투자 전략을 세우고 투표로 의사결정하는 기능.
> Base path: `/api/portfolios` · 전 라우트 🔒 인증 필수

---

## 목차

1. [개념 정리](#1-개념-정리)
2. [MP 생명주기 (상태 흐름)](#2-mp-생명주기)
3. [전략 준수도(Alignment) 계산](#3-전략-준수도alignment-계산)
4. [API 목록 요약](#4-api-목록-요약)
5. [MP API 상세](#5-mp-api-상세)
6. [DB 테이블](#6-db-테이블)
7. [에러 코드](#7-에러-코드)

---

## 1. 개념 정리

| 용어 | 뜻 |
|------|-----|
| **모델포트폴리오(MP)** | "우리 팀은 이런 비율로 투자하자"는 목표 포트폴리오. 종목별 **목표 비중(%)**을 담는다. |
| **Active MP** | 현재 운용 중인 MP. 팀당 **1개만** 존재. |
| **Draft** | 작성 중인 MP. 본인만 보고 수정/삭제 가능. 아직 팀에 공개 안 됨. |
| **수정안(Revision)** | 기존 Active MP를 기반으로 비중을 바꿔 제출하는 새 MP. |
| **투표** | 팀원 과반수 찬성 시 **가결**, 과반수 반대 시 **부결**. |
| **전략 준수도(Alignment)** | Active MP의 목표 비중 vs 실제 보유 비중이 얼마나 일치하는지 0~100점. |

---

## 2. MP 생명주기

```
[DRAFT] ──제출──▶ [PENDING] ──투표 가결──▶ [APPROVED] ──▶ Active MP로 등록
   │                  │                                      │
   │ (수정/삭제 가능)  │ (투표 부결)                           │ (새 MP 가결 시)
   ▼                  ▼                                      ▼
 (삭제됨)          [REJECTED]                            [ARCHIVED]
```

- **DRAFT**: 작성 중. 본인만 수정/삭제/제출 가능.
- **PENDING**: 팀에 공개됨. 팀원이 투표 진행 중.
- **APPROVED**: 과반수 찬성. 자동으로 Active MP가 됨. 기존 Active는 ARCHIVED로.
- **REJECTED**: 과반수 반대. 끝.
- **ARCHIVED**: 과거에 운용했던 MP. 이력 조회용.

---

## 3. 전략 준수도(Alignment) 계산

Active MP 상세 조회(`GET /active`) 시 자동 계산되어 응답에 포함된다.

### 계산 공식

```
TotalValue      = Σ(현재가 × 보유수량) + 현금잔액
CurrentWeight_i = (현재가_i × 수량_i) / TotalValue × 100
Tolerance_i     = TargetWeight_i × 0.02          ← 허용 오차 2%
RawDiff_i       = |CurrentWeight_i - TargetWeight_i|
Diff_i          = 0                     (RawDiff ≤ Tolerance 이면)
                = RawDiff - Tolerance   (초과 시)

TotalDiff       = Σ Diff_i    ← 목표에 없는 보유 종목은 Target=0%로 포함

Alignment       = 100 × (1 - TotalDiff / 200)    ← 0~100 클램프
```

### 종목별 상태 기준

| 상태 | 조건 | 의미 |
|------|------|------|
| `NORMAL` | 괴리 ≤ 목표비중 × 5% | 정상 |
| `CAUTION` | 5% < 괴리 ≤ 10% | 주의 |
| `WARNING` | 괴리 > 목표비중 × 10% | 경고 |

### 준수도 등급

| 점수 | 등급 |
|------|------|
| 90 초과 | 우수 |
| 75~90 | 보통 |
| 75 미만 | 개선 필요 |

---

## 4. API 목록 요약

### MP (모델포트폴리오)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/portfolios` | MP 홈 (Active + Draft + Pending + Archived) |
| GET | `/api/portfolios/active` | Active MP 상세 + Alignment |
| POST | `/api/portfolios` | 새 MP 작성 (Draft 저장 또는 바로 제출) |
| GET | `/api/portfolios/:id` | MP 상세 |
| PUT | `/api/portfolios/:id` | Draft MP 수정 |
| DELETE | `/api/portfolios/:id` | Draft MP 삭제 |
| POST | `/api/portfolios/:id/submit` | Draft → PENDING 제출 |
| POST | `/api/portfolios/:id/votes` | MP 투표 (찬성/반대) |
| GET | `/api/portfolios/:id/votes` | 투표 현황 |

## 5. MP API 상세

### 5-1. MP 홈 조회

```
GET /api/portfolios
```

팀의 모든 MP를 카테고리별로 분류해 반환한다.

**응답 예시**

```json
{
  "success": true,
  "data": {
    "active": {
      "team_id": 1,
      "portfolio_id": 5,
      "title": "IT 대형주 중심 성장 포트폴리오",
      "proposer_nickname": "김투자",
      "activated_at": "2026-03-02T00:00:00.000Z",
      "allocations": [
        { "stock_code": "AAPL", "stock_name": "Apple Inc", "target_percentage": 40, "reason": null },
        { "stock_code": "MSFT", "stock_name": "Microsoft", "target_percentage": 25, "reason": null },
        { "stock_code": "GOOGL", "stock_name": "Alphabet", "target_percentage": 20, "reason": null },
        { "stock_code": "AMZN", "stock_name": "Amazon", "target_percentage": 15, "reason": null }
      ]
    },
    "drafts": [
      {
        "id": 8,
        "title": "미래 성장 산업 분산 포트폴리오",
        "status": "DRAFT",
        "created_at": "2026-03-08T00:00:00.000Z",
        "allocations": [
          { "stock_code": "TSLA", "stock_name": "Tesla", "target_percentage": 40, "reason": null },
          { "stock_code": "NVDA", "stock_name": "NVIDIA", "target_percentage": 30, "reason": null }
        ]
      }
    ],
    "pending": [],
    "archived": [
      {
        "id": 2,
        "title": "플랫폼 기업 중심 포트폴리오",
        "status": "ARCHIVED",
        "proposer_nickname": "최애널",
        "created_at": "2026-02-09T00:00:00.000Z",
        "allocations": [...]
      }
    ]
  }
}
```

**카테고리 설명**

| 필드 | 내용 |
|------|------|
| `active` | 현재 운용 중인 Active MP. 없으면 `null`. |
| `drafts` | 내가 작성 중인 Draft MP 목록. 다른 팀원의 Draft는 안 보임. |
| `pending` | 팀 전체 투표 중인 MP 목록. |
| `archived` | 과거에 운용했던 MP 이력. |

---

### 5-2. Active MP 상세 (+ Alignment)

```
GET /api/portfolios/active
```

현재 운용 중인 Active MP의 상세 정보와 **전략 준수도**를 함께 반환한다.

**응답 예시**

```json
{
  "success": true,
  "data": {
    "team_id": 1,
    "portfolio_id": 5,
    "title": "IT 대형주 중심 성장 포트폴리오",
    "description": "AI 반도체 산업의 지속적인 성장이 예상되며...",
    "analysis": "기술적 분석: 현재 RSI 지표는 65로...",
    "proposer_nickname": "김투자",
    "activated_at": "2026-03-02T00:00:00.000Z",

    "allocations": [
      { "stock_code": "AAPL", "stock_name": "Apple Inc", "target_percentage": 40, "reason": null },
      { "stock_code": "MSFT", "stock_name": "Microsoft", "target_percentage": 25, "reason": null },
      { "stock_code": "GOOGL", "stock_name": "Alphabet", "target_percentage": 20, "reason": null },
      { "stock_code": "AMZN", "stock_name": "Amazon", "target_percentage": 15, "reason": null }
    ],

    "alignment": 89.4,
    "total_diff": 21.2,
    "alignment_items": [
      {
        "stock_code": "AAPL",
        "target_weight": 40,
        "current_weight": 35.8,
        "diff": -4.2,
        "raw_diff": 4.2,
        "status": "CAUTION"
      },
      {
        "stock_code": "MSFT",
        "target_weight": 25,
        "current_weight": 36.6,
        "diff": 11.6,
        "raw_diff": 11.6,
        "status": "WARNING"
      },
      {
        "stock_code": "GOOGL",
        "target_weight": 20,
        "current_weight": 16.5,
        "diff": -3.5,
        "raw_diff": 3.5,
        "status": "CAUTION"
      },
      {
        "stock_code": "AMZN",
        "target_weight": 15,
        "current_weight": 11.1,
        "diff": -3.9,
        "raw_diff": 3.9,
        "status": "CAUTION"
      }
    ],

    "account": {
      "cash_balance": 500000,
      "total_equity": 9800000,
      "return_rate": -2.0
    }
  }
}
```

**주요 필드 설명**

| 필드 | 타입 | 설명 |
|------|------|------|
| `alignment` | number | 전략 준수도 0~100. 높을수록 목표 비중에 가까움. |
| `total_diff` | number | 총 괴리도. 낮을수록 좋음. |
| `alignment_items[].target_weight` | number | 목표 비중(%) |
| `alignment_items[].current_weight` | number | 현재 실제 비중(%) |
| `alignment_items[].diff` | number | 현재 - 목표 (양수면 초과, 음수면 부족) |
| `alignment_items[].status` | string | `NORMAL` / `CAUTION` / `WARNING` |
| `account` | object | 팀 계좌 요약 (현금, 총자산, 수익률) |

**에러**

| 상태 | 메시지 | 상황 |
|------|--------|------|
| 403 | 소속된 팀이 없습니다 | 팀 미가입 |
| 404 | 운용 중인 모델포트폴리오가 없습니다 | Active MP 없음 |

---

### 5-3. 새 MP 작성

```
POST /api/portfolios
```

STEP 1(종목 구성) + STEP 2(상세 정보)를 한 번에 보내거나, 중간 저장(Draft)할 수 있다.

**Request Body**

```json
{
  "type": "NEW",
  "title": "반도체 중심 성장 포트폴리오",
  "description": "AI 반도체 산업의 지속적인 성장이 예상되며...",
  "analysis": "기술적 분석: RSI 65, 골든크로스 형성...",
  "allocations": [
    { "stock_code": "AAPL", "target_percentage": 50, "reason": "AI 인프라 핵심 기업" },
    { "stock_code": "MSFT", "target_percentage": 50, "reason": null }
  ],
  "status": "DRAFT"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `type` | string | - | `NEW`(신규, 기본값) 또는 `REVISION`(수정안) |
| `parent_id` | number | - | 수정안일 때 원본 MP의 id |
| `title` | string | - | MP 제목 (Draft 저장 시에는 빈 값 허용) |
| `description` | string | - | 투자 근거 |
| `analysis` | string | - | 상세 분석 (선택) |
| `allocations` | array | - | 종목별 비중 목록 |
| `allocations[].stock_code` | string | O | 종목 코드 |
| `allocations[].target_percentage` | number | O | 목표 비중 0~100 |
| `allocations[].reason` | string | - | 종목별 투자 근거 (선택) |
| `status` | string | - | `DRAFT`(저장, 기본값) 또는 `PENDING`(바로 제출) |

> **비중 합계**: `status: "PENDING"`으로 바로 제출할 때만 합계 100% 검증.
> Draft 저장 시에는 미완성 상태도 허용.

**응답 (201)**

```json
{
  "success": true,
  "data": { "id": 12, "status": "DRAFT" }
}
```

---

### 5-4. MP 상세 조회

```
GET /api/portfolios/:id
```

**응답 예시**

```json
{
  "success": true,
  "data": {
    "id": 12,
    "team_id": 1,
    "type": "NEW",
    "parent_id": null,
    "proposed_by": 3,
    "title": "반도체 중심 성장 포트폴리오",
    "description": "AI 반도체 산업의 지속적인 성장이...",
    "analysis": "기술적 분석: RSI 65...",
    "status": "PENDING",
    "approval_count": 2,
    "rejection_count": 0,
    "created_at": "2026-03-08T00:00:00.000Z",
    "allocations": [
      { "stock_code": "AAPL", "stock_name": "Apple Inc", "target_percentage": 50, "reason": "AI 인프라 핵심" },
      { "stock_code": "MSFT", "stock_name": "Microsoft", "target_percentage": 50, "reason": null }
    ],
    "votes": [
      { "voter_id": 1, "voter_nickname": "김팀장", "is_approved": true, "created_at": "..." },
      { "voter_id": 2, "voter_nickname": "이멤버", "is_approved": true, "created_at": "..." }
    ]
  }
}
```

---

### 5-5. Draft MP 수정

```
PUT /api/portfolios/:id
```

**본인이 작성한 DRAFT 상태의 MP만** 수정 가능.

**Request Body** — 변경할 필드만 보내면 됨

```json
{
  "title": "수정된 제목",
  "description": "수정된 투자 근거",
  "allocations": [
    { "stock_code": "AAPL", "target_percentage": 60, "reason": null },
    { "stock_code": "NVDA", "target_percentage": 40, "reason": "AI GPU 선도 기업" }
  ]
}
```

> `allocations`를 보내면 기존 종목 구성을 **전부 교체**한다 (부분 수정 아님).

---

### 5-6. Draft MP 삭제

```
DELETE /api/portfolios/:id
```

**본인이 작성한 DRAFT 상태의 MP만** 삭제 가능.

**응답**

```json
{ "success": true, "data": { "id": 12 } }
```

---

### 5-7. Draft → 제출

```
POST /api/portfolios/:id/submit
```

Draft MP를 PENDING 상태로 변경하여 팀 투표에 회부한다.

**제출 조건** (미충족 시 400)

- MP 제목이 있어야 함
- 투자 근거(description)가 있어야 함
- 종목이 1개 이상이어야 함
- 비중 합계가 정확히 100%여야 함

**응답**

```json
{ "success": true, "data": { "id": 12, "status": "PENDING" } }
```

---

### 5-8. MP 투표

```
POST /api/portfolios/:id/votes
```

**Request Body**

```json
{ "is_approved": true }
```

- `true`: 찬성
- `false`: 반대

**투표 규칙**

- 같은 팀원만 투표 가능
- PENDING 상태의 MP에만 투표 가능
- 1인 1표 (중복 투표 시 409)
- **과반수 찬성** → 자동으로 `APPROVED` + Active MP 등록 (기존 Active는 `ARCHIVED`)
- **과반수 반대** → 자동으로 `REJECTED`

**응답 (201)**

```json
{
  "success": true,
  "data": {
    "portfolio_id": 12,
    "vote": "APPROVE",
    "approval_count": 3,
    "rejection_count": 0,
    "status": "APPROVED"
  }
}
```

`status`가 `APPROVED`로 바뀌었다면 이 투표로 가결된 것.

---

### 5-9. 투표 현황 조회

```
GET /api/portfolios/:id/votes
```

**응답 예시**

```json
{
  "success": true,
  "data": {
    "portfolio_id": 12,
    "status": "PENDING",
    "approval_count": 2,
    "rejection_count": 0,
    "votes": [
      { "voter_id": 1, "voter_nickname": "김팀장", "is_approved": true, "created_at": "..." },
      { "voter_id": 2, "voter_nickname": "이멤버", "is_approved": true, "created_at": "..." }
    ]
  }
}
```

---

## 6. DB 테이블

### Portfolios (기존 테이블 확장)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | |
| team_id | INT FK → Teams | 소속 팀 |
| **type** | ENUM('NEW','REVISION') | 🆕 신규 or 수정안 |
| **parent_id** | INT NULL | 🆕 수정안의 원본 MP id |
| proposed_by | INT FK → Users | 작성자 |
| title | VARCHAR(100) | MP 제목 |
| **description** | TEXT | 🆕 투자 근거 |
| **analysis** | TEXT | 🆕 상세 분석 |
| approval_count | INT | 찬성 수 |
| rejection_count | INT | 반대 수 |
| status | ENUM | 🆕 `DRAFT` `PENDING` `APPROVED` `REJECTED` `ARCHIVED` |
| created_at | TIMESTAMP | |

### PortfolioAllocations (기존 테이블 확장)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INT PK | |
| portfolio_id | INT FK → Portfolios | |
| stock_code | VARCHAR(20) FK → Stocks | |
| target_percentage | DECIMAL(5,2) | 목표 비중(%) |
| **reason** | TEXT | 🆕 종목별 투자 근거 |

### TeamActivePortfolios (기존 — 변경 없음)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| team_id | INT PK FK → Teams | 팀당 1개 |
| portfolio_id | INT FK → Portfolios | 현재 Active MP |
| activated_at | TIMESTAMP | 활성화 시점 |

---

## 7. 에러 코드

| 상태 | 코드 | 메시지 | 발생 상황 |
|------|------|--------|----------|
| 400 | `INVALID_ALLOCATION_SUM` | 비중 합계가 100%여야 합니다 | 제출 시 비중 합계 ≠ 100% |
| 400 | — | MP 제목을 입력해주세요 | 제출 시 title 누락 |
| 400 | — | 투자 근거를 입력해주세요 | 제출 시 description 누락 |
| 400 | — | 종목을 1개 이상 추가해주세요 | 제출 시 allocations 비어있음 |
| 400 | — | 작성 중(Draft) 상태의 MP만 수정/삭제/제출할 수 있습니다 | DRAFT가 아닌 MP 수정 시도 |
| 400 | — | 투표 중인 MP에만 투표할 수 있습니다 | PENDING이 아닌 MP에 투표 |
| 403 | — | 소속된 팀이 없습니다 | 팀 미가입 상태에서 접근 |
| 403 | — | 본인이 작성한 MP만 수정/삭제/제출할 수 있습니다 | 타인 MP 수정 시도 |
| 403 | — | 같은 팀의 MP에만 투표할 수 있습니다 | 다른 팀 MP에 투표 |
| 404 | — | 포트폴리오를 찾을 수 없습니다 | 존재하지 않는 id |
| 404 | — | 운용 중인 모델포트폴리오가 없습니다 | Active MP 없음 |
| 409 | — | 이미 투표했습니다 | 중복 투표 |

---

## 마이그레이션

```bash
npx db-migrate up 20260717000001-portfolio-enhancements
```

롤백:

```bash
npx db-migrate down 20260717000001-portfolio-enhancements
```
