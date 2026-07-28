# API 카탈로그 (전 도메인)

> **이 문서는 "현재 코드에 실제로 존재하는 API"의 단일 목록이다.**
> 유지 규칙: **API를 추가/변경/삭제한 사람이 같은 PR에서 이 문서의 해당 도메인 표를 갱신한다.** (PR 체크리스트에 포함 권장)
> 용도: 팀원 간 API 파악 · Postman 컬렉션 시드 · 추후 Swagger(OpenAPI) 작성의 원본.
> 상세 스키마가 따로 있는 도메인은 표에서 스펙 문서를 링크한다. 최종 검증일: 2026-07-28

## 공통 규칙

**응답 봉투·에러 코드·페이지네이션 등 전 도메인 공통 규칙은 [api-conventions.md](api-conventions.md) 참조.** 요약:

- Base URL: `/api` (예외: OAuth 리다이렉트 콜백 `/auth/*/callback`)
- **인증**: `Authorization: Bearer {accessToken}` — 표의 🔒 표시. 실패 시 401 (`TOKEN_EXPIRED` / `TOKEN_INVALID` 코드 포함)
- **응답 포맷**: 성공 `{ "success": true, "data": ... }` · 실패 `{ "success": false, "message": "...", ["code": "..."] }`
- **검증**: Joi (validate 미들웨어) — 실패 시 400 + 첫 에러 메시지
- 시간: DB TIMESTAMP(UTC) → JSON ISO 문자열

## auth — 인증 (`/api/auth`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/auth/kakao` | — | 카카오 로그인. body `{ code }` → 유저 생성/로그인 + access/refresh 토큰 (+개인계좌 자동 생성) |
| POST | `/api/auth/naver` | — | 네이버 로그인. 동일 흐름 |
| POST | `/api/auth/google` | — | 구글 로그인. 동일 흐름 |
| POST | `/api/auth/refresh` | — | body `{ refreshToken }` → access 재발급 |
| POST | `/api/auth/logout` | — | body `{ refreshToken }` → 무효화 |
| GET | `/auth/kakao/callback` `/auth/naver/callback` `/auth/google/callback` | — | OAuth 리다이렉트 콜백 (프론트 미경유 테스트용) |

로컬(이메일/비번) 로그인은 미구현 — OAuth 3종만 존재.

## user — 유저 (`/api/users`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/users` | — | 유저 목록 (예시 수준 스텁 — 실사용 API 아님) |
| POST | `/api/users/attendance/check-in` | 🔒 | 출석 체크인 (앱 접속 시 프론트가 명시적으로 호출) |
| GET | `/api/users/attendance/streak` | 🔒 | 이번 주(월~일) 출석 + 연속학습일 (칭찬 화면용) |
| GET | `/api/users/attendance?year=&month=` | 🔒 | 월별 출석 조회 |

## school — 학교 (`/api/schools`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/schools?keyword=` | — | 학교 검색 (커리어넷 동기화 데이터) |
| POST | `/api/schools/sync` | 🔒 | 커리어넷 동기화 (관리자 전용) |

## team — 팀 (`/api/teams`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/teams` | 🔒 | 팀 생성 (+팀 계좌 자동 생성) |
| POST | `/api/teams/join` | 🔒 | 팀 가입. body `{ team_id }` |
| GET | `/api/teams?keyword=&page=` | 🔒 | 팀 목록/검색 |
| GET | `/api/teams/me` | 🔒 | 내 팀 조회 |

## learning — 학습 (`/api/learning`, 전 라우트 🔒)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/learning/topics?level=` | 학습 메인 (주제 목록+진행현황+오늘의 플로우+레벨) |
| GET | `/api/learning/topics/:topicId/shortforms` | 숏폼 목록 (좋아요/저장/완료 상태 포함) |
| POST | `/api/learning/shortforms/:shortformId/complete` | 숏폼 시청 완료 |
| PATCH | `/api/learning/shortforms/:shortformId/like` | 숏폼 좋아요 토글 |
| PATCH | `/api/learning/shortforms/:shortformId/save` | 숏폼 저장 토글 |
| GET | `/api/learning/topics/:topicId/quizzes` | 퀴즈 문제 조회 |
| POST | `/api/learning/quizzes/:quizId/answer` | 퀴즈 단건 채점. body `{ answer }` |
| POST | `/api/learning/topics/:topicId/quizzes/complete` | 퀴즈 세션 완료 (결과 페이지) |

## community — 커뮤니티 (`/api/community`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/community/posts` | 🔒 | 게시글 작성 |
| GET | `/api/community/posts/:id` | — | 게시글 단건 |
| GET | `/api/community/posts?cursor=&limit=&post_type=&stock_code=&keyword=` | — | 게시글 목록 (커서 기반) |
| GET | `/api/community/posts/my` | 🔒 | 내 게시글 ⚠️ 라우트 순서 버그: `/posts/:id`가 먼저 선언돼 `my`가 :id로 매칭됨 — 담당자 수정 필요 |
| PATCH / DELETE | `/api/community/posts/:id` | 🔒 | 게시글 수정/삭제 |
| GET | `/api/community/stocks/search?keyword=` | — | 게시글용 종목 검색 |
| POST | `/api/community/posts/:post_id/comments` | 🔒 | 댓글 작성 |
| GET | `/api/community/posts/:post_id/comments` | — | 댓글 목록 |
| PATCH / DELETE | `/api/community/comments/:comment_id` | 🔒 | 댓글 수정/삭제 |
| POST | `/api/community/posts/:post_id/like` `/bookmark` `/view` | 🔒 | 게시글 좋아요/스크랩 토글, 조회수 기록 |
| POST | `/api/community/comments/:comment_id/like` | 🔒 | 댓글 좋아요 토글 |
| GET | `/api/community/hot/stocks` `/hot/posts` | — | 핫 종목 / 인기 게시글 |
| POST | `/api/community/users/:user_id/follow` | 🔒 | 팔로우 토글 |
| GET | `/api/community/users/:user_id/follow/counts` `/followers` `/followings` | — | 팔로우 수/목록 |
| GET | `/api/community/notifications` | 🔒 | 알림 목록 |
| PATCH | `/api/community/notifications/:notification_id/read` · `/notifications/read-all` | 🔒 | 알림 읽음 처리 (단건/전체) |

## stock — 종목/시세 (`/api/stocks`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/stocks/search?keyword=&limit=` | — | 종목 검색 (검색바) |
| GET | `/api/stocks/watchlist` | 🔒 | 내 관심종목 목록 (현재가·등락 포함, 시세 실패 종목은 price null) |
| POST | `/api/stocks/watchlist` | 🔒 | 관심종목 등록. body `{ stock_code }` — 없는 종목 400, 중복 409 |
| DELETE | `/api/stocks/watchlist/:stock_code` | 🔒 | 관심종목 해제 — 미등록 404 |
| GET | `/api/stocks/:symbol/chart?range=` | — | 시세 차트 (Twelve Data + Redis 캐시) |
| GET | `/api/stocks/:symbol/quote` | — | 현재가+등락률 (초기값 — 실시간은 WS `price`) |

## trading — 모의투자 주문 (`/api/trading`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/trading/orders?status=&page=&limit=` | 🔒 | 내 주문내역 (최신순, status 필터, `pagination.total` 포함) |
| POST | `/api/trading/orders` | 🔒 | 주문 생성. body `{ stock_code, order_type: BUY\|SELL, price_type: MARKET\|LIMIT, order_quantity, [order_price] }` — 시장가 즉시체결, 지정가는 실시간 심볼만(PENDING 후 틱 체결) |
| DELETE | `/api/trading/orders/:id` | 🔒 | 대기(PENDING) 주문 취소 — 체결됨/타인 주문은 409/403 |

## account — 가상계좌/평가 (`/api/accounts`)
상세 스키마: spec-account-valuation §5 (⚠️ 스펙 문서가 리포에 미수록 — 보유자가 `docs/specs/`에 추가 필요)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/accounts/me` | 🔒 | 내 계좌 요약(총자산/현금/수익률/현금비중) + 보유종목별 평가손익·비중. 계좌 없으면 자동 생성 후 응답 |

`/me`는 Phase 0 범위. 팀 계좌 조회·자산 추이·시즌 정보는 아래 [구현 필요 백로그](#구현-필요-백로그-코드에-없는-api) 참조.

## portfolio — 모델포트폴리오 (`/api/portfolios`)

상세: [docs/portfolio-api.md](portfolio-api.md) — MP 생명주기·Alignment 공식·에러 코드 포함

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/portfolios` | 🔒 | MP 홈 (Active + Draft + Pending + Archived 분류) |
| GET | `/api/portfolios/active` | 🔒 | Active MP 상세 + 목표 vs 현재 비중 + 전략 준수도(Alignment) |
| POST | `/api/portfolios` | 🔒 | 새 MP 작성 (Draft 저장 or 바로 PENDING 제출). body에 allocations·title·description 등 |
| GET | `/api/portfolios/:id` | 🔒 | MP 상세 (allocations + votes 포함) |
| PUT | `/api/portfolios/:id` | 🔒 | Draft MP 수정 (본인·DRAFT만) |
| DELETE | `/api/portfolios/:id` | 🔒 | Draft MP 삭제 (본인·DRAFT만) |
| POST | `/api/portfolios/:id/submit` | 🔒 | Draft → PENDING 제출 (title·description·allocations 100% 필수) |
| POST | `/api/portfolios/:id/votes` | 🔒 | MP 투표. body `{ is_approved }` — 과반수 시 자동 가결/부결 |
| GET | `/api/portfolios/:id/votes` | 🔒 | 투표 현황 (투표자 목록 포함) |

## ranking — 랭킹 (`/api/ranking`)

상세 명세: [ranking-api.md](ranking-api.md) (개념·산식·응답 스키마·Open Questions) · ZSET 미계산 시 빈 목록 + `updated_at: null`

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/ranking/individual?page=&limit=` | 🔒 | 개인 리더보드 — PersonalScore(수익률%), 동점 시 2차 참여율·3차 출석일 재정렬 (2026-07-21) |
| GET | `/api/ranking/teams?page=&limit=` | 🔒 | 팀 리더보드 — TeamScore(Point 소수1) = R%×0.9 + Alignment×0.1(스텁 100 고정), R%·Alignment 분리 노출, 동점은 공동 순위 (2026-07-28) |
| GET | `/api/ranking/schools?mode=individual\|team&page=&limit=` | 🔒 | 소속(학교) 리더보드 — 학교별 가중평균 org score. `mode=individual`: Σ(개인점수×참여율)/Σ참여율(단위 %) · `mode=team`: 팀점수 평균(단위 Point). 응답에 `unit` 포함, 동점은 공동 순위 (2026-07-28) |
| GET | `/api/ranking/me` | 🔒 | 내 순위 요약 — `individual` + `team`(무소속 null) + `school_individual`·`school_team`(학교 미설정 null, 순위판 미등재는 rank null). 4개 섹션 전부 `rank_change` 포함 (2026-07-28) |
| GET | `/api/ranking/season` | 🔒 | 현재 시즌 기간/D-day (2026-07-21) |

랭킹 4종 전체 구현 완료 (개인·팀·소속2종). 자동화도 구현 완료 (2026-07-28): 장중 1분 스케줄러 + 평일 16:05 ET 일일 스냅샷(DailyRankings·AccountAssetHistories) — 리더보드 3종 각 행에 `rank_change`(직전 스냅샷 대비, 없으면 null) 추가.

## 실시간 (Socket.IO)

| 방향 | 이벤트 | 설명 |
|---|---|---|
| client→server | `subscribe` / `unsubscribe` | payload `{ symbol }` — 심볼 룸 구독/해제 (실패 시 `subscribe-error`) |
| server→client | `subscribed` | 구독 확인 |
| server→client | `price` | 구독 심볼의 실시간 틱 `{ symbol, price, timestamp }` |
| server→client | `resync` | 시세 스트림 재연결 후 재동기화 신호 |

## 기타

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/health` | 헬스체크 |

---

# 구현 필요 백로그 (코드에 없는 API)

> 화면(홈/투자/리그/팀/마이페이지) 기준으로 역산한 목록. **구현 착수 전 담당·기획 확인 → 구현 후 위 카탈로그 표로 이동.**
> 우선순위: P1 = 이미 합의된 계획에 존재 · P2 = 화면상 필요한데 계획에 없음(기획 확인 필요) · P3 = 편의/보강

## P1 — 계획 문서에 이미 있는 것

| API | 도메인 | 근거/비고 |
|---|---|---|
| 메인홈 집계 (기존 API 조합 or 별도 엔드포인트) | 미정 | plan 백로그 — 프론트와 협의 |
| `GET /api/accounts/me/history` — 자산(수익률) 추이 | account | **기록은 구현 완료 (2026-07-28)** — 일일 스냅샷이 AccountAssetHistories에 매일 UPSERT. 남은 건 **조회 API**만. 노출 화면 범위는 기획 확인 중 |
| ~~`GET /api/ranking/season`~~ | ~~ranking~~ | ✅ **구현 완료 (2026-07-21)** — 위 ranking 표로 이동 |

## P2 — 화면상 필요한데 계획에 없음 (기획 확인 후 배분)

| API | 도메인 | 왜 필요한가 |
|---|---|---|
| `GET /api/teams/me/account` — 내 팀 계좌 요약+보유 | **team** | 팀 모드 화면 (2026-07-12 확정: 포트폴리오 도메인 이후 team 도메인에서 구현). **평가 계산은 반드시 account `getAccountValuation(팀계좌id)` 소비 — 직접 구현 금지** |
| `GET /api/users/me` · `PATCH /api/users/me` — 내 프로필 조회/수정(닉네임·학교) | user | 마이페이지 필수. 현재 user 도메인은 스텁 + 출석 API뿐 |
| `GET /api/users/:id` — 타인 프로필 | user | 커뮤니티에서 작성자 클릭 시 |
| `GET /api/teams/:id` — 팀 상세(팀원 목록·포지션) | team | 팀 랭킹에서 팀 클릭 시. TRADER 포지션 표시 |
| `POST /api/teams/leave` (또는 DELETE) — 팀 탈퇴 | team | 가입만 있고 탈퇴 없음 |
| `GET /api/learning/shortforms/saved` — 저장한 숏폼 목록 | learning | save 토글은 있는데 저장 목록 조회가 없음 (마이페이지 "저장한 콘텐츠") |
| `GET /api/community/posts/bookmarked` — 내 스크랩 목록 | community | bookmark 토글은 있는데 목록 조회가 없음 |
| 로컬(이메일/비번) 회원가입·로그인 | auth | 기획 필요 여부 확인 — 현재 OAuth 3종만 |

## P3 — 편의/보강

| API | 도메인 | 비고 |
|---|---|---|
| `GET /api/stocks/realtime-symbols` — 지정가 가능(실시간) 심볼 목록 | stock | 프론트가 주문 UI에서 지정가 허용 여부를 미리 알아야 함 (현재는 400 에러로만 알 수 있음) |
| `GET /api/trading/orders/:id` — 주문 단건(체결 로그 포함) | trading | 주문 상세 화면이 생기면 |
| `DELETE /api/users/me` — 회원 탈퇴 | user | 스토어 심사 시 필수 (계좌 CASCADE 정책 포함 설계 필요) |
