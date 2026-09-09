# API 카탈로그 (전 도메인)

> **이 문서는 "현재 코드에 실제로 존재하는 API"의 단일 목록이다.**
> 유지 규칙: **API를 추가/변경/삭제한 사람이 같은 PR에서 이 문서의 해당 도메인 표를 갱신한다.** (PR 체크리스트에 포함 권장)
> 용도: 팀원 간 API 파악 · Postman 컬렉션 시드.
> **요청/응답 스키마까지 담은 정식 명세는 [openapi.yaml](openapi.yaml)** — 서버 기동 후 `/api-docs`(Swagger UI)에서 바로 시험 호출할 수 있고, `/api-docs.json`은 Postman 임포트용이다. 이 표와 openapi.yaml은 **같은 PR에서 함께** 갱신한다 (`npm run check:openapi`가 경로 누락/유령 경로를 잡는다).
> 상세 스키마가 따로 있는 도메인은 표에서 스펙 문서를 링크한다. 최종 검증일: 2026-09-07 (openapi.yaml 대조)

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
| POST | `/api/auth/firebase-token` | — | Firebase ID 토큰을 검증해 백엔드 access/refresh 토큰 발급. body `{ idToken }` |
| POST | `/api/auth/refresh` | — | body `{ refreshToken }` → access 재발급 |
| POST | `/api/auth/logout` | — | body `{ refreshToken }` → 무효화 |
| GET | `/api/auth/kakao/start` `/api/auth/naver/start` | — | 브라우저 OAuth 시작. `?return_to=`(allowlist 검증) → state 저장 후 공급자로 redirect |
| POST | `/api/auth/oauth-ticket` | — | `/start` 흐름의 1회용 ticket을 백엔드 토큰으로 교환. body `{ ticket }` |
| GET | `/auth/kakao/callback` `/auth/naver/callback` `/auth/google/callback` | — | OAuth 리다이렉트 콜백 (프론트 미경유 테스트용) |
| POST | `/api/auth/qa-session` | — | QA용 PIN 로그인. `MAIN_QA_*` 활성 시에만 열림 (15분당 50회) |
| POST | `/api/auth/email/send` | 🔒 | 대학교 이메일 인증코드 발송 (시간당 3회) |
| POST | `/api/auth/email/verify` | 🔒 | 대학교 이메일 인증코드 확인 (5분당 10회) |
| POST | `/api/auth/phone/send` | 🔒 | 휴대폰 인증번호 발송 (Solapi). 응답 `{ cooldown_seconds, expires_in_seconds }` — 프론트 타이머용. 시간당 3회 + 30초 쿨다운(`RESEND_COOLDOWN`), 타 계정 인증번호 409 `PHONE_ALREADY_USED` |
| POST | `/api/auth/phone/verify` | 🔒 | 휴대폰 인증번호 확인 (6자리, TTL 3분). 실패 사유는 `CODE_EXPIRED` / `CODE_MISMATCH` / `PHONE_ALREADY_USED`로 구분 |

로컬(이메일/비번) 로그인은 미구현이다. 기존 Firebase 소셜 로그인을 사용하는 앱은 `/firebase-token` 브리지를 사용한다.
브라우저 OAuth는 `/start` → 공급자 → `/auth/*/callback` → `#ticket=` → `/oauth-ticket` 순서다. 토큰·이메일을 redirect URL에 싣지 않는다.

## user — 유저 (`/api/users`)

마이페이지 상세 스키마: [mypage-api.md](mypage-api.md)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/users` | — | 유저 목록 (예시 수준 스텁 — 실사용 API 아님) |
| POST | `/api/users/attendance/check-in` | 🔒 | 출석 체크인 (앱 접속 시 프론트가 명시적으로 호출) |
| GET | `/api/users/attendance/streak` | 🔒 | 이번 주(월~일) 출석 + 연속학습일 (칭찬 화면용) |
| GET | `/api/users/attendance?year=&month=` | 🔒 | 월별 출석 조회 |
| GET | `/api/users/me` | 🔒 | 마이페이지 프로필 (PM-01) — 닉네임·학교·팀·출석·포인트·리그순위·자산요약 |
| PATCH | `/api/users/me` | 🔒 | 프로필 편집 (PM-03) — body `{ nickname }`, `{ school_id }` 또는 둘 다. 학교 변경 시 인증 해제·개인 계좌 학교 그룹 동기화. 팀 소속 중 학교 변경 불가 |
| DELETE | `/api/users/me` | 🔒 | 회원 탈퇴 (AUTH-14) — CASCADE로 관련 데이터 삭제 |
| PATCH | `/api/users/me/agreements` | 🔒 | 약관·개인정보·마케팅 동의 저장. body `{ [terms], [privacy], [marketing] }` — **보낸 항목만 갱신**. 필수 항목(terms/privacy)은 `true`만 허용(철회는 탈퇴 소관). 동의 시각·약관 버전을 함께 기록. 조회는 `GET /api/users/me`의 `agreements` |
| GET | `/api/users/me/notification-prefs` | 🔒 | 알림 수신 설정. 저장값이 없어도 **전 항목이 서버 기본값으로 채워져** 내려간다 |
| PATCH | `/api/users/me/notification-prefs` | 🔒 | 알림 수신 설정 부분 수정. 그룹·항목 중 최소 하나. 정의에 없는 키는 400. 응답은 갱신 후 전체 상태 |

## school — 학교 (`/api/schools`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/schools?keyword=&region=&limit=` | — | 학교 검색 (커리어넷 동기화 데이터). limit 기본 20·최대 50 |
| POST | `/api/schools/sync` | 🔒 | 커리어넷 동기화 (관리자 전용). body `{ [gubuns: (elem_list\|midd_list\|high_list\|univ_list)[] ] }` — 미지정 시 서비스 기본값 |

## team — 팀 (`/api/teams`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/teams` | 🔒 | 팀 생성 (+팀 계좌 자동 생성). body `{ name, position: TRADER\|ANALYST, [max_member_count=4] }` — 대학은 이메일 인증, 고교는 학교 선택 필수(미충족 403), 이미 팀 있으면 409 |
| POST | `/api/teams/join` | 🔒 | 팀 가입. body `{ join_code(8자), position }` — 같은 학교 팀만(403), 정원 초과 409, 코드 오류 404 |
| GET | `/api/teams?keyword=&limit=` | 🔒 | **같은 학교** 팀 목록/검색 (limit 기본 20·최대 50, `page` 없음) |
| GET | `/api/teams/me` | 🔒 | 내 팀 조회. ⚠️ `members[]`에 `role`(LEADER/MEMBER)만 있고 `position`(TRADER/ANALYST)은 없다 (P2 참조) |
| GET | `/api/teams/me/account` | 🔒 | 팀 계좌 요약+보유 (TH-01/TT-01) — **응답 스키마가 `/api/accounts/me`와 동일**(Scope 토글 시 프론트 컴포넌트 재사용). 팀 미소속 403 |
| GET | `/api/teams/me/account/history` | 🔒 | 팀 성과 추이 (TH-01) — `/api/accounts/me/history`와 동일 스키마. 팀 미소속 403 |
| GET | `/api/teams/me/exit-options` | 🔒 | 탈퇴 가능 조건. `leave_effect`(`LEAVE`/`AUTO_DELEGATE`/`DISBAND`)가 `POST /me/leave`의 실제 결과 — 프론트가 조건을 추측하지 않도록 서버가 판정 |
| POST | `/api/teams/me/leave` | 🔒 | 팀 탈퇴. 팀원이면 그냥 탈퇴, 팀장이면 **가장 오래된 팀원에게 자동 위임** 후 탈퇴, 혼자면 **자동 해체**. 한 트랜잭션. 탈퇴 시 `position`은 `NONE`으로 |
| POST | `/api/teams/me/delegate-and-leave` | 🔒 | 넘길 사람을 직접 골라 위임 후 탈퇴. body `{ user_id }` — 팀장만(403), 자기 자신 400, 타 팀원 404 |
| DELETE | `/api/teams/me` | 🔒 | 팀 해체 (팀장만). 팀원·포트폴리오·팀 계좌·주문·보유가 CASCADE 삭제. 과거 순위 기록은 남는다(확정 시점 팀 이름 스냅샷) |
| GET | `/api/teams/me/rules` | 🔒 | 팀 규칙 조회. 미작성 팀은 `content: null`·`version: 0`(오류 아님). 저장 시 이 `version`을 돌려보낸다 |
| PUT | `/api/teams/me/rules` | 🔒 | 팀 규칙 저장 (팀장만). body `{ content, version }` — **낙관적 잠금**. 그 사이 누가 먼저 저장했으면 409 `RULES_VERSION_CONFLICT` |
| PATCH | `/api/teams/me/members/:userId/role` | 🔒 | 팀원 역할·포지션 변경 (팀장만). body `{ [role], [position] }` — `role: LEADER`는 곧 **위임**(현 팀장 동시 강등). 위임 없는 자가 강등은 409 `LAST_LEADER` |

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
| POST | `/api/learning/topics/:topicId/quizzes/complete` | 퀴즈 세션 완료 (결과 페이지). 응답에 숫자가 두 벌 — `correctCount`·`score`는 **누적**(한 번이라도 정답이면 정답, UserProgress 값), `attempt`는 **이번 회차** 기준. 재도전 시 갈린다 |
| GET | `/api/learning/quiz-results?page=&limit=` | 퀴즈 응시 이력. **완료된 회차만** 최신순. 점수는 확정 시점 스냅샷이라 나중에 퀴즈가 추가·삭제돼도 안 바뀐다. `total_quiz_count`는 그 회차에 푼 수가 아니라 **주제의 전체 문제 수** |

## community — 커뮤니티 (`/api/community`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| POST | `/api/community/posts` | 🔒 | 게시글 작성 |
| GET | `/api/community/posts/:id` | — | 게시글 단건 |
| GET | `/api/community/posts?cursor=&limit=&post_type=&stock_code=&keyword=&search_type=` | — | 게시글 목록 (커서 기반). ⚠️ `keyword`와 `search_type`(`TITLE\|CONTENT\|AUTHOR`)은 **반드시 함께** 보내야 한다 (Joi `.and()` — 하나만 오면 400) |
| GET | `/api/community/posts/my` | 🔒 | 내 게시글 (라우트 순서 수정 완료) |
| GET | `/api/community/posts/bookmarked` | 🔒 | 내 스크랩 목록 (PM-02) — 마이페이지 "저장한 콘텐츠" |
| PATCH / DELETE | `/api/community/posts/:id` | 🔒 | 게시글 수정/삭제 |
| GET | `/api/community/stocks/search?keyword=` | — | 게시글용 종목 검색 |
| POST | `/api/community/posts/:post_id/comments` | 🔒 | 댓글 작성. body `{ content, [parent_id] }` — `parent_id`가 있으면 대댓글, 게시글 `comment_count` +1 |
| GET | `/api/community/posts/:post_id/comments` | — | 댓글 목록 (댓글→대댓글 2단 트리, `replies` 배열). **각 노드에 `is_deleted` 포함** — `true`면 답글이 남아있어 자리표시로 내려온 삭제 댓글이라 `content`·`author_nickname`이 `null`이다. 프론트는 "삭제된 댓글입니다"로 렌더. 답글까지 전부 삭제된 가지는 아예 안 내려온다 |
| PATCH / DELETE | `/api/community/comments/:comment_id` | 🔒 | 댓글 수정/삭제 (삭제는 소프트, `comment_count` −1. 답글 수는 그대로 유지) |
| POST | `/api/community/posts/:post_id/like` `/bookmark` `/view` | 🔒 | 게시글 좋아요/스크랩 토글, 조회수 기록 (조회수는 유저당 1회) |
| POST | `/api/community/comments/:comment_id/like` | 🔒 | 댓글 좋아요 토글 |
| GET | `/api/community/hot/stocks` `/hot/posts` | — | 핫 종목 / 인기 게시글 |
| POST | `/api/community/users/:user_id/follow` | 🔒 | 팔로우 토글 |
| GET | `/api/community/users/:user_id/follow/counts` `/followers` `/followings` | — | 팔로우 수/목록 |
| GET | `/api/community/notifications?limit=` | 🔒 | 알림 목록 (limit 기본 20·최대 100) |
| PATCH | `/api/community/notifications/:notification_id/read` · `/notifications/read-all` | 🔒 | 알림 읽음 처리 (단건/전체) |
| GET | `/api/community/users/suggested?limit=` | 🔒 | 추천 사용자. 관심종목 교집합(가중치 높음)+최근 30일 글 수로 정렬. 본인·이미 팔로우·차단(양방향) 제외. 근거 없는 사용자는 제외되므로 빈 배열일 수 있다 |
| POST | `/api/community/reports` | 🔒 | 게시글·댓글·사용자 신고. body `{ target_type: POST\|COMMENT\|USER, target_id, reason, [detail] }` — `reason: ETC`면 detail 필수. 같은 대상 중복 신고 409 `ALREADY_REPORTED`. 접수만 하고 status는 `RECEIVED`(제재 주체 미구현) |
| GET | `/api/community/blocks?keyword=&page=&limit=` | 🔒 | 차단 목록. 관리 화면이라 **page/limit 방식**(피드의 cursor와 다름) |
| POST | `/api/community/blocks` | 🔒 | 사용자 차단. body `{ user_id }` — 이미 차단해도 성공(멱등). **차단 시 서로의 팔로우가 끊긴다** |
| DELETE | `/api/community/blocks/:userId` | 🔒 | 차단 해제 — 목록에 없으면 404. 팔로우는 복원되지 않는다 |

**차단 효과**: 선언은 단방향이지만 **가시성은 양방향**이다. 차단 이후 서로의 글·댓글·팔로우 목록·알림에서 상대가 보이지 않는다(조회 8곳에 공통 필터 적용). 비로그인 조회에는 적용되지 않는다 — 보는 사람이 정해지지 않기 때문. 쓰기(차단한 사람 글에 댓글·좋아요)는 아직 막지 않는다.

## stock — 종목/시세 (`/api/stocks`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/stocks/search?keyword=&limit=` | — | 종목 검색 (검색바) |
| GET | `/api/stocks/watchlist` | 🔒 | 내 관심종목 목록 (현재가·등락 포함, 시세 실패 종목은 price null) |
| POST | `/api/stocks/watchlist` | 🔒 | 관심종목 등록. body `{ stock_code }` — 없는 종목 400, 중복 409 |
| DELETE | `/api/stocks/watchlist/:stock_code` | 🔒 | 관심종목 해제 — 미등록 404 |
| GET | `/api/stocks/:symbol/chart?range=&before=` | — | 시세 차트 (Twelve Data + Redis 캐시). `before`=분봉 lazy 로딩 기준 unix초. 심볼의 `/`는 `%2F` 인코딩 |
| GET | `/api/stocks/signals` | — | 투자 신호. `POPULAR`(관심목록·글 태그 기준) / `RSI_OVERSOLD`(14일 RSI≤30) / `MACD_GOLDEN_CROSS`(막 상향 돌파한 봉). **지표는 일봉으로 서버가 직접 계산**(차트 1Y 캐시 재사용 → 대개 추가 크레딧 0). `as_of`(계산 시각)와 신호별 `based_on`(반영한 마지막 봉)을 함께 준다. 15분 캐시 |
| GET | `/api/stocks/related-terms?q=&limit=` | — | 연관 검색어. 글 태그·관심목록 **동시 출현**으로 추천(검색 로그·업종 정보가 없어 이 신호뿐). `matched_by`로 `related`(연관)와 `prefix`(검색어 보정) 구분. 데이터가 없으면 빈 배열 |
| GET | `/api/stocks/:symbol/quote` | — | 현재가+등락률 (초기값 — 실시간은 WS `price`) |

## stock-alert — 종목 알림 (`/api/stock-alerts`, 전 라우트 🔒)

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/stock-alerts/:symbol` | 종목별 알림 조건 조회. **설정한 조건만** 배열로 온다(미설정 항목은 빠짐 — 프론트가 기본 4개에 합침) |
| PUT | `/api/stock-alerts/:symbol` | 종목별 알림 저장. body `{ alerts: [{ type, threshold, [is_enabled] }] }` — 보낸 배열이 **그 종목의 전체 설정**(멱등). 빈 배열은 전체 해제. type: `TARGET_PRICE`/`STOP_LOSS`/`DAILY_CHANGE`/`VOLUME`, 같은 type 중복 400 |
| POST | `/api/stock-alerts/push-token` | 기기 푸시 토큰 등록. body `{ token, platform: IOS\|ANDROID\|WEB }` — 토큰은 **기기**에 딸린 값이라 유일하고, 재등록 시 소유자를 옮긴다 |

`threshold` 단위는 `type`이 정한다 — 가격(USD) / 등락률(%, 음수 가능) / 거래량(주).
**실제 발송(가격 도달 감지)은 미구현**이다. 이 API는 설정 CRUD까지다.

## trading — 모의투자 주문 (`/api/trading`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/trading/orders?status=&page=&limit=` | 🔒 | 내 주문내역 (최신순, status 필터, `pagination.total` 포함) |
| POST | `/api/trading/orders` | 🔒 | 주문 생성. body `{ stock_code, order_type: BUY\|SELL, price_type: MARKET\|LIMIT, order_quantity, [order_price] }` — 시장가 즉시체결, 지정가는 실시간 심볼만(PENDING 후 틱 체결) |
| DELETE | `/api/trading/orders/:id` | 🔒 | 대기(PENDING) 주문 취소 — 체결됨/타인 주문은 409/403 |
| GET | `/api/trading/team/queue` | 🔒 | 팀 실행 대기열 (TO-01) — Active MP 대비 비중 괴리·Alignment. MP 없으면 전 필드 null + 빈 items |
| POST | `/api/trading/team/orders` | 🔒 | 팀 계좌 주문 실행 (TO-02) — body는 개인 주문과 동일. **Trader 포지션만** (아니면 403 `TRADER_ONLY`) |
| GET | `/api/trading/team/orders?status=&page=&limit=` | 🔒 | 팀 주문 내역 (TO-03) — 팀원이면 조회 가능 |

## account — 가상계좌/평가 (`/api/accounts`)

| Method | Path | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/accounts/me` | 🔒 | 내 계좌 요약(총자산/현금/수익률/현금비중) + 보유종목별 평가손익·비중. 계좌 없으면 자동 생성 후 응답 |
| GET | `/api/accounts/me/history` | 🔒 | 자산(수익률) 추이 (PI-01) — `data`는 배열이 아니라 **`{ account_id, season_id, items: [{ date: "YYYY-MM-DD", total_equity, return_rate }] }`** 래퍼다(`items`가 오름차순). **기간 파라미터 없음**: 계좌가 시즌 단위(≤90일)라 전 구간을 통째로 내리고 1주/1개월 탭은 프론트가 자른다. 오늘 점은 마감 배치(평일 16:05 ET) 전까지 없으므로, 라이브 값이 필요하면 `/accounts/me`의 `total_equity`를 이어 붙인다 |

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
| GET | `/api/ranking/individual?page=&limit=` | 🔒 | 개인 리더보드 — PersonalScore(수익률%), 동점 시 2차 참여율·3차 출석일 재정렬 |
| GET | `/api/ranking/teams?page=&limit=` | 🔒 | 팀 리더보드 — TeamScore(Point 소수1) = R%×0.9 + Alignment×0.1. Alignment는 **금요일 종가 주간 확정값**(MP 없는 팀은 0). 응답 필드는 `team_score`·`r_percent`뿐 — **`alignment`는 안 내려간다**(필요 시 `(team_score − r_percent×0.9)/0.1`로 역산). 동점은 공동 순위 |
| GET | `/api/ranking/schools?mode=individual\|team&page=&limit=` | 🔒 | 소속(학교) 리더보드 — 학교별 가중평균 org score. `mode=individual`: Σ(개인점수×참여율)/Σ참여율(단위 %) · `mode=team`: 팀점수 평균(단위 Point). 응답에 `unit` 포함, 동점은 공동 순위 |
| GET | `/api/ranking/me` | 🔒 | 내 순위 요약 — `individual` + `team`(무소속 null) + `school_individual`·`school_team`(학교 미설정 null, 순위판 미등재는 rank null). 4개 섹션 전부 `rank_change` 포함 |
| GET | `/api/ranking/season` | 🔒 | 현재 시즌 기간/D-day |

랭킹 4종 전체 구현 완료 (개인·팀·소속2종). 자동화 구현 완료: 장중 1분 스케줄러 + 평일 16:05 ET 일일 스냅샷(DailyRankings·AccountAssetHistories) + 리더보드·/me `rank_change`. **고교/대학 리그 완전 분리** — 그룹은 서버가 유저 학교로 자동 판별(응답 `school_group`), 학교 미설정 유저는 리그 제외. 팀 참여율=팀원 출석 평균, Alignment=금요일 종가 주간 확정(MP 없으면 0). 상세: ranking-api.md.

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
| ⚠️ **고교 SMS 인증** = **PM-04 / AUTH-07** | user / school | 대학 이메일 인증은 지원한다. 고교는 현재 커리어넷 학교 선택으로 팀 온보딩을 허용하며, SMS 인증 결과를 백엔드 신뢰 상태로 연결하는 작업은 후속 과제다. |

## P2 — 화면상 필요한데 계획에 없음 (기획 확인 후 배분)

| API | 도메인 | 왜 필요한가 |
|---|---|---|
| `GET /api/users/:id` — 타인 프로필 | user | 커뮤니티에서 작성자 클릭 시 |
| `GET /api/teams/:id` — **타인 팀** 상세 | team | 팀 랭킹에서 다른 팀 클릭 시. 내 팀은 `GET /teams/me`가 이미 `members`를 준다 — 포지션 표시만 필요하면 새 API가 아니라 `findMembersByTeamId` SELECT에 `u.position` 추가로 끝 |
| `POST /api/teams/leave` (또는 DELETE) — 팀 탈퇴 | team | 가입만 있고 탈퇴 없음 |
| `GET /api/learning/shortforms/saved` | learning | 마이페이지 "저장한 콘텐츠" — 콘텐츠(숏폼) 시딩 후 구현 |

## P3 — 편의/보강

| API | 도메인 | 비고 |
|---|---|---|
| `GET /api/stocks/realtime-symbols` — 지정가 가능(실시간) 심볼 목록 | stock | 프론트가 주문 UI에서 지정가 허용 여부를 미리 알아야 함 (현재는 400 에러로만 알 수 있음) |
| `GET /api/trading/orders/:id` — 주문 단건(체결 로그 포함) | trading | 주문 상세 화면이 생기면 |
