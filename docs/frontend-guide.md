# 프론트엔드 연동 가이드

> 프론트팀에게 전달하는 온보딩 1페이지. API 상세는 전부 Swagger에 있으니 이 문서는 "어디서 뭘 보면 되는지"만 담는다.

## 1. 접속 정보

| 항목 | 값 |
|---|---|
| Base URL (로컬) | `http://localhost:3000` |
| Base URL (개발 서버) | `http://<탄력IP>` ← 배포 후 갱신 예정 |
| **API 문서 (Swagger UI)** | `{BASE}/api-docs` — 전 엔드포인트 스키마 + 브라우저에서 바로 시험 호출(Try it out) |
| OpenAPI JSON | `{BASE}/api-docs.json` — Postman 임포트 · 코드젠용 |
| 헬스체크 | `GET {BASE}/api/health` |

## 2. 인증 흐름 (요약)

1. 소셜 로그인: `POST /api/auth/kakao|naver|google` body `{ code }` → `{ accessToken, refreshToken, user }`
2. 이후 모든 🔒 API에 `Authorization: Bearer {accessToken}` (만료 15분)
3. 401 + `code: "TOKEN_EXPIRED"` → `POST /api/auth/refresh` body `{ refreshToken }` → 새 토큰 쌍으로 교체
   (⚠️ refresh는 **회전식** — 응답의 새 refreshToken으로 반드시 교체 저장. 옛 토큰 재사용 시 세션 전체 무효화됨)
4. 401 + `TOKEN_INVALID` 또는 `REFRESH_TOKEN_*` → 재로그인

Swagger에서 직접 호출해 보려면: 우상단 **Authorize** 버튼에 accessToken 붙여넣기 (한 번 넣으면 유지됨).
백엔드팀에게 테스트 토큰을 요청하거나, 로컬이라면 `node -e "require('dotenv').config();console.log(require('./src/utils/jwt').signAccessToken({userId:1}))"`.

## 3. 공통 규약 (전 API 동일)

- 성공: `{ "success": true, "data": ... }` / 실패: `{ "success": false, "message": "한국어 메시지", "code": "분기용 코드(선택)" }`
- `message`는 그대로 화면에 노출해도 되는 문장. `code`가 있는 에러만 분기 처리 (목록: [api-conventions.md §5](api-conventions.md#5-에러-코드-레지스트리))
- 페이지네이션 2종: offset(`page`/`limit` + `pagination.total`) · cursor(`cursor`/`limit` + `hasNext`)
- 시간: ISO 8601 UTC 문자열
- 상세 규약: [api-conventions.md](api-conventions.md)

## 4. 실시간 시세 (Socket.IO)

REST가 아니라 Socket.IO로 옵니다 — Swagger에 안 나오는 유일한 부분.

```js
const socket = io(BASE);                       // 같은 포트, 기본 경로
socket.emit('subscribe', { symbol: 'AAPL' });  // 페어도 인코딩 없이 'BTC/USD' 그대로
socket.on('price', ({ symbol, price, change, changePercent, timestamp }) => { ... });
socket.on('resync', () => { /* 차트 REST 재조회 권장 */ });
```

전체 이벤트 계약·차트 연동 규칙(Lightweight Charts `time` 포맷 등): [stock-chart.md](stock-chart.md)
⚠️ REST 경로의 심볼은 반대로 **반드시 인코딩**: `/api/stocks/BTC%2FUSD/chart`

## 5. 도구 연동

- **Postman**: Import → Link → `{BASE}/api-docs.json` 붙여넣기 → 컬렉션 자동 생성
- **TypeScript 타입 생성**:
  ```bash
  npx openapi-typescript {BASE}/api-docs.json -o src/api-types.ts
  ```

## 6. 자주 걸리는 함정

| 함정 | 내용 |
|---|---|
| 게시글 검색 | `keyword`와 `search_type`은 **반드시 함께** — 하나만 보내면 400 |
| 심볼 슬래시 | REST 경로에서 `BTC/USD` → `BTC%2FUSD` (Socket.IO 페이로드는 그대로) |
| 자산 추이 그래프 | 오늘 점은 마감 배치(평일 16:05 ET) 전까지 없음 → `/accounts/me`의 `total_equity`를 이어 붙일 것 |
| 랭킹 `null` 구분 | 섹션 전체 null = 대상 없음(무소속/무학교) / `rank`만 null = 아직 순위판에 없음 |
| 리그 빈 목록 | `school_group: null` + 빈 목록 = 학교 미설정 유저 → "학교를 설정하면 리그 참여" UI |
| 삭제 댓글 | `is_deleted: true` 노드는 `content`가 null → "삭제된 댓글입니다"로 렌더 |
| 학습 데이터 | 콘텐츠(숏폼·퀴즈) 시딩 전에는 목록이 빈 배열(정상 200) |

## 7. 문서 지도

| 문서 | 내용 |
|---|---|
| **Swagger** `/api-docs` | 요청/응답 스키마의 단일 진실원천 |
| [api-catalog.md](api-catalog.md) | 전 API 한눈 목록 + 미구현 백로그 |
| [api-conventions.md](api-conventions.md) | 봉투·에러 코드·페이지네이션 규약 |
| [stock-chart.md](stock-chart.md) | 차트·실시간 시세 상세 |
| [ranking-api.md](ranking-api.md) / [portfolio-api.md](portfolio-api.md) / [mypage-api.md](mypage-api.md) | 도메인 심화 (산식·생명주기) |
