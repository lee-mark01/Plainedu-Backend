# Plainedu Backend

학생 대상 모의투자 · 금융학습 서비스의 API 서버.
소셜 로그인, 학교 인증, 모의투자 주문·체결, 실시간 시세, 리그 랭킹, 학습(숏폼·퀴즈), 커뮤니티를 제공한다.

`Node 20` · `Express 5` · `MySQL 8` · `Redis 7` · `Socket.IO` · `Twelve Data`

---

## 문서

| 문서 | 내용 |
|---|---|
| **[Swagger](https://api.plainedu.org/api-docs/)** | **API 상세 스펙 (89개, 항상 최신)** |
| [프론트엔드-인계문서.md](docs/프론트엔드-인계문서.md) | 프론트 진입점 — 인증·온보딩 흐름, 함정 |
| [api-catalog.md](docs/api-catalog.md) | 전 도메인 엔드포인트 한 장 요약 + 미구현 백로그 |
| [api-conventions.md](docs/api-conventions.md) | 응답 봉투, 상태코드, 에러코드 레지스트리 |
| [infrastructure.md](docs/infrastructure.md) | EC2 · Nginx · Docker 구성 |
| [deployment-guide.md](docs/deployment-guide.md) | 서버 세팅 절차 |
| [market-data-strategy.md](docs/market-data-strategy.md) | WS 슬롯 관리 설계 |
| [ranking-api.md](docs/ranking-api.md) · [portfolio-api.md](docs/portfolio-api.md) · [mypage-api.md](docs/mypage-api.md) · [stock-chart.md](docs/stock-chart.md) | 도메인별 상세 명세 |

---

## 빠른 시작

```bash
cp .env.example .env      # 값 채우기 (아래 표 참고)
docker compose up -d      # app + mysql + redis
docker compose exec app npm run migrate
```

→ http://localhost:3000/api-docs

**Docker 없이** (MySQL·Redis가 로컬에 있을 때):

```bash
npm install
npm run migrate
npm run dev               # nodemon
```

### 환경변수

`.env`는 **git에 없다**(`.gitignore`). 로컬은 `.env.example` 복사, **운영 서버는 EC2의 `~/Plainedu-Backend/.env`에 직접 있고 배포가 건드리지 않는다** → [운영 서버 env](#운영-서버-env) 참고.

아래는 코드가 실제로 읽는 키 전부다.

| 그룹 | 키 (괄호=기본값) | 비어 있으면 |
|---|---|---|
| DB | `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | 모든 API가 500 |
| JWT | `JWT_ACCESS_SECRET` · `JWT_ACCESS_EXPIRES_IN`(15m) | 시크릿 없으면 로그인·인증 전부 500 |
| OAuth | `KAKAO_CLIENT_ID/SECRET/REDIRECT_URI`<br>`NAVER_CLIENT_ID/SECRET`<br>`GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI` | 해당 소셜 로그인만 실패 |
| Redis | `REDIS_URL`(redis://localhost:6379) | 캐시·rate limit 실패 |
| 시세 | `TWELVEDATA_API_KEY` `REALTIME_SYMBOLS` `PRICE_TTL_SECONDS`(180) | 실시간 시세 없음 |
| 평가 배치 | `TWELVEDATA_CREDITS_PER_MINUTE`(8) `TWELVEDATA_RATE_WINDOW_MS`(61000) `TWELVEDATA_RATE_RETRY_ROUNDS`(2) | 기본값 사용 |
| 초기자본 | `INITIAL_CASH_INDIVIDUAL`(100000) `INITIAL_CASH_TEAM`(100000) | 기본값 사용 |
| 메일 | `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` | 학교 이메일 인증 불가 |
| 학교 | `CAREERNET_API_KEY` | 학교 목록 동기화 불가 |


서버 `.env`는 Git을 통해 자동 배포되지 않으므로, 새로운 환경변수를 추가하거나 변경한 경우 운영 서버에도 직접 반영해야 함.

자세한 내용은 [배포 가이드](docs/deployment-guide.md)를 참고.

```bash
ssh ubuntu@<EC2>
cd ~/Plainedu-Backend
nano .env                       # 키 추가
docker compose up -d --force-recreate app   # env_file은 재생성해야 반영됨
docker compose exec app printenv | grep <KEY>   # 확인
```

---

## npm scripts

| 명령 | 설명 |
|---|---|
| `npm run dev` | nodemon 개발 서버 |
| `npm start` | 프로덕션 기동 |
| `npm run migrate` / `migrate:down` | db-migrate 적용 / 롤백 |
| `npm test` | 전체 테스트 (Node 내장 `node --test`, 프레임워크 없음) |
| `npm run check:openapi` | **스펙 드리프트 검사** — Express 실제 라우트 ↔ openapi.yaml 양방향 대조 |
| `npm run seed:stocks` / `seed:users` / `seed:demo` | 시드 데이터 |

> API를 추가·변경하면 `check:openapi`를 돌린다. DB·Redis 없이 정적 파싱이라 CI에서 그냥 돈다.

---

## 프로젝트 구조

```
src/
├── app.js              Express 앱 (라우터 마운트, Swagger, 에러 핸들러)
├── server.js           HTTP + Socket.IO 기동, cron 등록
├── domains/            도메인별 수직 슬라이스 (11개)
│   └── {domain}/
│       ├── *.router.js       경로 + 미들웨어 체인 (인증·검증·rate limit)
│       ├── *.controller.js   req/res 처리만
│       ├── *.service.js      비즈니스 로직 (트랜잭션 경계)
│       ├── *.repository.js   SQL. executor 인자로 트랜잭션 주입
│       └── *.validator.js    Joi 스키마
├── marketData/         Twelve Data WS 업스트림 → 틱 처리 → Socket.IO 브로드캐스트
├── jobs/               node-cron (랭킹 집계, 리프레시 토큰 정리)
├── middlewares/        authenticate · validate · rateLimit · errorHandler
├── config/             db · redis · mailer · 장시간 · 시세 예산
└── errors/AppError.js  status + code 실은 도메인 에러

db/
├── migrations/         db-migrate (14개)
├── seeds/
└── schema.sql

docs/openapi.yaml       API 스펙 원본 → /api-docs 로 서빙
tests/                  node:test
```

**도메인 (11)** — `auth` `user` `school` `team` `learning` `community` `stock` `trading` `account` `portfolio` `ranking`

### 규칙

- **repository는 `executor`를 받는다.** 기본값 `pool`, 트랜잭션 중엔 connection을 넘겨 같은 트랜잭션에 태운다.
- **에러는 `AppError(message, status, code)`로 던진다.** 4xx는 message·code가 그대로 프론트에 나가는 계약. 500은 원문을 감추고 서버 로그에만 남긴다.
- **검증은 라우터에서 `validate(schema)`로.** 서비스에 도달한 입력은 형식이 맞다고 가정한다.
- **시간은 UTC로 저장·응답.** 장시간 판정만 `America/New_York` 기준.

---

## 실시간 (Socket.IO)

```
Twelve Data WS ──▶ wsUpstream ──▶ tickProcessor ──▶ wsGateway ──▶ 클라이언트
                                        │
                                        └──▶ Redis price:{symbol} (TTL 기본 180s)
```

구독 종목 수가 요금제 한도에 묶여 `subscriptions.js`가 슬롯을 태그 기반으로 배분한다. 설계 근거는 [market-data-strategy.md](docs/market-data-strategy.md).

---

## 배포

`main` push → GitHub Actions([deploy.yml](.github/workflows/deploy.yml)) → EC2 SSH → `git pull` → `docker compose build/up` → `migrate`

- 운영: **https://api.plainedu.org** (EC2 + Nginx 리버스 프록시 + Cloudflare TLS)
- EC2 IP 직접 접근 불가 — 도메인으로 붙는다
- 브랜치: `main`(운영) ← `develop` ← 기능 브랜치


## 테스트

```bash
npm test                                  # 전체
node --test tests/ranking.service.test.js # 단일
```

프레임워크 없이 Node 내장 러너를 쓴다. DB가 필요한 테스트는 `.env`의 DB에 붙으므로 **운영 DB를 가리킨 채 돌리지 않는다.**
