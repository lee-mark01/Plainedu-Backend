# QA 테스트 계정·데이터 안내 (프론트엔드용)

배포된 메인 서버에서 소셜 로그인 없이 로그인하고, 신규 기능 화면을 실제 데이터로 확인하는 방법.

- **베이스 URL**: `http://<EC2_PUBLIC_IP>/api`
- **Swagger**: `http://<EC2_PUBLIC_IP>/api-docs`
- **PIN**: 별도 전달 (문서에 적지 않음)

---

## 1. 로그인 — PIN 하나로 계정을 골라 받는다

```http
POST /api/auth/qa-session
Content-Type: application/json

{ "pin": "<전달받은 PIN>", "persona": "admin" }
```

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "...",
    "user": { "id": 69, "email": "dummy.admin@test.com", "nickname": "더미관리자", "role": "ADMIN" }
  }
}
```

이후 요청에 `Authorization: Bearer <accessToken>`을 붙인다. 세션은 **8시간** 뒤 만료되고,
`POST /api/auth/refresh`로 갱신한다. 실제 소셜 로그인과 같은 토큰이므로 모든 API를 그대로 쓸 수 있다.

`persona`를 생략하면 `leader`로 로그인한다.

### 오류

| 상태 | 코드 | 뜻 |
|---|---|---|
| 400 | `QA_PERSONA_UNKNOWN` | `persona` 값이 아래 목록에 없음 (이메일을 직접 넣어도 이 오류) |
| 401 | `QA_PIN_INVALID` | PIN 불일치 |
| 404 | `QA_AUTH_DISABLED` | QA 로그인이 꺼져 있음 (경로 자체가 없는 것처럼 보인다) |
| 429 | `RATE_LIMITED` | 15분에 50회 초과 |
| 503 | `QA_DATA_NOT_READY` | 시드가 아직 안 돌았음 |

---

## 2. 계정 7종

| `persona` | 계정 상태 | 이 계정으로 확인할 화면 |
|---|---|---|
| `leader` (기본) | 팀장(Trader) · 학교 인증 · 휴대폰 인증 · 약관(마케팅 거부) | 팀 홈, 팀 계좌, 모델포트폴리오, 팀장 승인, 차단 목록, 알림 설정, 종목 알림 |
| `member` | 팀원(Analyst) · 학교 인증 | 포트폴리오 작성·투표, **퀴즈 응시 이력** |
| `solo` | 팀 없음 · 학교 인증 | 팀 검색·가입 신청 (이미 대기 중 1건) |
| `restricted` | **커뮤니티 제한 중(7일)** · 이의신청 접수됨 | 글쓰기 403, 제한 안내 화면, 이의신청 상태 |
| `unverified` | 학교 미인증 · 휴대폰 번호만 입력 | 학교 인증 유도, 휴대폰 인증 유도 |
| `noschool` | 학교 없음 · **약관 미동의** | 온보딩 처음 상태 |
| `admin` | **`role = ADMIN`** | `/api/admin/*` 신고 목록, 제재 부과, 이의신청 처리 |

계정은 배포마다 새로 만들어지므로 **`user_id`는 고정이 아니다.** 화면에 하드코딩하지 말고 응답 값을 쓸 것.

---

## 3. 미리 들어 있는 데이터

| 화면 | 데이터 | 확인 경로 |
|---|---|---|
| 약관 동의 | 필수 2종 동의, **마케팅만 거부** | `GET /api/users/me` → `agreements` |
| 휴대폰 | `leader` 인증 완료 / `unverified` 미인증 | `GET /api/users/me` → `phone` |
| 알림 설정 | `community.post_like`·`service.notice`만 **끔**, 나머지 켜짐 | `GET /api/users/me/notification-prefs` |
| 게시글 | 일반 2건 + AAPL 종목토론 1건 | `GET /api/community/posts` |
| 댓글 | 2건 (`comment_count` 정합됨) | 게시글 상세 |
| 차단 | `leader` → `solo`2 1건 | `GET /api/community/blocks` |
| 신고 | 3건 — **같은 글에 2건 누적** | `GET /api/admin/reports` → `target_report_count` |
| 이용 제한 | `restricted` 계정 7일 제한 (부과자 = 관리자) | `GET /api/community/restrictions/me` |
| 이의신청 | 1건 `RECEIVED` | `GET /api/community/restriction/appeals` |
| 팀 가입 신청 | **대기 2건** (ANALYST·TRADER) | `GET /api/teams/me/join-requests` |
| 퀴즈 이력 | 2건 완료, 점수 80·60 | `GET /api/learning/quiz-results` |
| 종목 알림 | AAPL 목표가 250, NVDA 손절 150 | `GET /api/stock-alerts/AAPL` |
| 투자 | 계좌·보유종목·주문·자산추이·리그 순위 | 기존 투자 API |

---

## 4. 바로 눌러볼 확인 시나리오

**① 관리자 권한 분리**

```
admin  로그인 → GET /api/admin/reports        → 200, target_report_count 누적 확인
leader 로그인 → GET /api/admin/reports        → 403 ADMIN_ONLY
```

**② 제재 → 차단된 사용자 경험**

```
restricted 로그인 → POST /api/community/posts        → 403 COMMUNITY_RESTRICTED
                  → GET  /api/community/restrictions/me → 제한 사유·만료일
                  → GET  /api/community/restriction/appeals → 이의신청 RECEIVED
admin      로그인 → POST /api/admin/appeals/{id}/decision {"decision":"APPROVE"}
restricted 재확인 → POST /api/community/posts        → 201 (제한 해제됨)
```

> 이의신청을 승인하면 제한이 함께 풀린다. 다시 막힌 상태로 보려면
> `admin`으로 `POST /api/admin/restrictions`를 다시 부과하면 된다.

**③ 차단의 양방향 가시성**

차단은 **한쪽이 선언하고 양쪽에서 안 보인다.**

```
비로그인 / member  → GET /api/community/posts → 3건 (전체)
leader (차단한 쪽)  → 2건  — solo2의 글이 사라짐
restricted(차단당한) → 2건  — leader의 글이 사라짐 (자기 글은 보임)
```

**④ 팀 가입 승인**

```
leader 로그인 → GET  /api/teams/me/join-requests   → 대기 2건, 각 request_id 확인
              → POST /api/teams/me/join-requests   {"request_id": 5, "decision": "APPROVE"}
```

> 승인·거절은 같은 경로에 `decision`(`APPROVE` | `REJECT`)을 보낸다. `request_id`는 본문에 담는다.

> 가입 정책은 **코드 입력 → 팀장 승인** 한 가지다. 코드만으로 즉시 가입되지 않는다.

**⑤ 알림 설정 부분 수정**

```
GET   /api/users/me/notification-prefs           → post_like·notice만 false
PATCH /api/users/me/notification-prefs {"community":{"post_like":true}}
GET   /api/users/me/notification-prefs           → notice는 여전히 false (초기화 안 됨)
```

---

## 5. 데이터가 초기화되는 시점

`main`에 머지되어 배포가 돌 때마다 **QA 계정과 그 데이터가 전부 지워지고 다시 만들어진다.**

```
git pull → migrate → seed:learning → seed:main-qa(cleanup → seed-demo → seed-qa-features)
```

- 테스트하며 만든 글·주문·차단은 다음 배포에 사라진다
- `user_id`·`post_id`·`join_code`는 배포마다 바뀐다
- QA 계정(`dummy.*@test.com`)만 지운다 — 실제 소셜 로그인 계정은 건드리지 않는다

---

## 6. 참고

- QA 로그인은 `MAIN_QA_AUTH_ENABLED` 환경변수로 켜고 끈다. QA 기간이 끝나면 내려서
  경로 자체를 없앤다(404). 그때는 소셜 로그인만 남는다.
- `persona`는 시드 계정 화이트리스트다. PIN이 유출돼도 실제 사용자 계정으로는 로그인할 수 없다.
- 응답 필드는 전부 `snake_case`, 오류 코드는 `SCREAMING_SNAKE_CASE`다 (`docs/api-conventions.md`).
- 전체 계약은 Swagger(`/api-docs`)와 `docs/openapi.yaml`이 기준이다.
