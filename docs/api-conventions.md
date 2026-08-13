# API 공통 규약 (Conventions)

> 전 도메인 REST API가 따르는 공통 규칙. **새 API를 만들 때 이 문서 기준으로 작성**하고, 규칙을 바꾸거나 에러 코드를 추가하면 같은 PR에서 이 문서를 갱신한다.
> API 목록은 [api-catalog.md](api-catalog.md), 도메인별 상세 스키마는 각 도메인 스펙 문서 참조.

## 1. 응답 봉투 (Response Envelope)

모든 응답은 아래 봉투를 사용한다.

**성공**

```json
{ "success": true, "data": { ... } }
```

**실패** (모든 에러는 errorHandler 미들웨어를 통해 나감 — 컨트롤러에서 직접 에러 응답 금지, `next(err)` 사용)

```json
{ "success": false, "message": "사람이 읽는 한국어 메시지", "code": "MACHINE_READABLE_CODE" }
```

- `message`: 항상 존재. 한국어. 프론트가 그대로 노출해도 되는 문장.
- `code`: 선택. 프론트가 **메시지 표시 이상의 분기**(리다이렉트, 재시도, 특정 UI)를 해야 하는 에러에만 부여. `SCREAMING_SNAKE_CASE`. 부여 시 [§5 에러 코드 표](#5-에러-코드-레지스트리)에 등록.

**신규 API 규칙**: 성공 응답은 항상 `{ success, data }`. 반환할 것이 없는 액션도 `data`에 결과 상태를 담는다(예: 토글 → `{ "liked": true }`). 성공 응답에 `message`를 넣지 않는다(문구는 프론트 소관).
기존 API 일부는 `{ success: true }` 단독 또는 `{ success: true, message }` 형태가 남아 있음 — 레거시 허용, 프론트와 합의 전 임의 변경 금지.

## 2. HTTP 상태 코드

| 상태 | 용도 |
|---|---|
| 200 | 조회·수정·삭제·토글 성공 |
| 201 | 리소스 생성 성공 (주문, 게시글, 팀, MP, 관심종목 등) |
| 400 | 요청 형식/값 오류 (Joi 검증 실패 포함) |
| 401 | 인증 실패 (토큰 없음/만료/무효) |
| 403 | 인증은 됐지만 권한 없음 (타인 리소스, 선행 조건 미충족) |
| 404 | 리소스 없음 |
| 409 | 현재 상태와 충돌 (중복 등록, 이미 투표, 취소 불가 주문) |
| 429 | 요청 한도 초과 (`RATE_LIMITED`) — `Retry-After` 헤더에 재시도까지 남은 초 |
| 500 | 서버 내부 오류 (code 없음, message는 고정 문구) |

## 3. 인증

- 헤더: `Authorization: Bearer {accessToken}`
- 실패 시 401 + `TOKEN_EXPIRED`(→ 프론트는 `POST /api/auth/refresh` 시도) 또는 `TOKEN_INVALID`(→ 재로그인)
- refresh 실패 시 401 + `REFRESH_TOKEN_*` 코드 → 재로그인

## 4. 요청 검증

- Joi 스키마 + `validate` 미들웨어 (`validate(schema)` = body, `validate(schema, 'query'|'params')`)
- 실패 시 **400 + 첫 번째 에러 메시지** (`{ success: false, message: "..." }`, code 없음)
- body·query 필드명은 `snake_case` (예: `stock_code`, `order_type`)

## 5. 에러 코드 레지스트리

`code`가 부여된 에러 전체 목록. **코드를 추가한 사람이 이 표에 한 줄 추가한다.**

| HTTP | code | 의미 / 프론트 처리 | 도메인 |
|---|---|---|---|
| 401 | `TOKEN_EXPIRED` | 액세스 토큰 만료 → refresh 시도 | 공통 (authenticate) |
| 401 | `TOKEN_INVALID` | 유효하지 않은 토큰 → 재로그인 | 공통 (authenticate) |
| 401 | `REFRESH_TOKEN_INVALID` | 리프레시 토큰 무효 → 재로그인 | auth |
| 401 | `REFRESH_TOKEN_EXPIRED` | 리프레시 토큰 만료 → 재로그인 | auth |
| 401 | `TOKEN_REUSE_DETECTED` | 리프레시 토큰 재사용 감지(탈취 의심) → 세션 전체 무효화됨, 재로그인 | auth |
| 403 | `EMAIL_REQUIRED` | 카카오 이메일 제공 미동의 → 동의 안내 | auth |
| 409 | `PROVIDER_CONFLICT` | 같은 이메일이 다른 소셜로 이미 가입 → 해당 제공사로 로그인 유도 | auth |
| 400 | `INVALID_UNIVERSITY_EMAIL` | 허용 도메인 목록에 없는 이메일 → 학교 이메일 재입력 안내 | auth (이메일 인증) |
| 400 | `CODE_EXPIRED` | 인증코드 만료(5분)·없음 → 재발송 버튼 노출 | auth (이메일 인증) |
| 400 | `CODE_MISMATCH` | 인증코드 불일치 → 재입력 | auth (이메일 인증) |
| 400 | `LIMIT_SYMBOL_NOT_SUPPORTED` | 실시간 미제공 종목에 지정가 주문 → 시장가로 유도 | trading |
| 400 | `INSUFFICIENT_FUNDS` / `INSUFFICIENT_HOLDINGS` | 현금·보유수량 부족 | trading |
| 403 | `TRADER_ONLY` | 팀 주문 실행은 Trader 포지션만 | trading (팀) |
| 400 | `QUIZ_NOT_FINISHED` | 안 푼 문제가 남은 채 세션 완료 시도 | learning |
| 429 | `RATE_LIMITED` | 요청 한도 초과 → `Retry-After` 헤더(초)만큼 기다렸다 재시도 | 공통 (rateLimit) |
| 403 | `SHORTFORM_NOT_COMPLETED` | 숏폼 미완료 상태로 퀴즈 접근 → 숏폼 화면으로 유도 | learning |
| 404 | `TOPIC_NOT_FOUND` | 존재하지 않는 학습 주제 | learning |
| 404 | `SHORTFORM_NOT_FOUND` | 존재하지 않는 숏폼 | learning |
| 404 | `QUIZ_NOT_FOUND` | 존재하지 않는 퀴즈 (또는 주제에 퀴즈 없음) | learning |
| 409 | `ORDER_NOT_CANCELABLE` | PENDING이 아닌 주문 취소 시도 | trading |
| 400 | `INVALID_ALLOCATION_SUM` | MP 비중 합계 ≠ 100% | portfolio |

그 외 에러(관심종목 중복 409, MP 권한 403 등)는 code 없이 `message` + HTTP 상태만 사용 — 상태 코드로 분기가 충분한 경우 code를 만들지 않는다. portfolio 도메인의 code 없는 에러 목록은 [portfolio-api.md §8](portfolio-api.md#8-에러-코드) 참조.

## 6. 페이지네이션

두 방식이 공존한다. 목록 성격에 맞게 선택:

| 방식 | 요청 | 응답 | 사용처 / 언제 쓰나 |
|---|---|---|---|
| **offset** | `?page=&limit=` | `data: { orders, pagination: { page, limit, total } }` | trading 주문내역 — 총 개수·페이지 번호가 필요한 목록 |
| **cursor** | `?cursor=&limit=` | `data: { posts, hasNext }` | community 피드 — 무한 스크롤, 실시간으로 늘어나는 목록 |

## 7. 시간

- DB: TIMESTAMP (UTC) → JSON 응답: ISO 8601 문자열 (예: `"2026-07-19T02:30:00.000Z"`)
- 날짜만 받는 쿼리는 `?year=&month=` 형식 (출석 조회 등)
