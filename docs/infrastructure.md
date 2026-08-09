# 인프라 구성

## 아키텍처

```
Client (Browser / Postman)
    │
    │  HTTP / WebSocket (port 80)
    ▼
┌─────────────────────────────────────────────────┐
│  EC2 (Ubuntu 24.04, t2.small, 30GB)             │
│  IP: 3.34.223.29                                │
│                                                 │
│  ┌───────────────────────────────────────────┐   │
│  │  Nginx (직접 설치)                         │   │
│  │  :80 → 127.0.0.1:3000 리버스 프록시        │   │
│  │  WebSocket Upgrade 지원                    │   │
│  └──────────────────┬────────────────────────┘   │
│                     │                            │
│  ┌──────────────────▼────────────────────────┐   │
│  │  Docker Compose                           │   │
│  │                                           │   │
│  │  ┌─────────────────────────────────────┐  │   │
│  │  │  app (Node.js 20 Alpine)            │  │   │
│  │  │  plainedu-app :3000                 │  │   │
│  │  │  - Express API 서버                  │  │   │
│  │  │  - Socket.IO (실시간 시세 브로드캐스트) │  │   │
│  │  │  - Twelve Data WS (업스트림 시세)     │  │   │
│  │  │  - node-cron (랭킹, 토큰 정리)       │  │   │
│  │  └─────────────┬───────────┬───────────┘  │   │
│  │                │           │              │   │
│  │  ┌─────────────▼──┐  ┌────▼───────────┐  │   │
│  │  │  mysql 8.0     │  │  redis 7       │  │   │
│  │  │  :3306         │  │  :6379         │  │   │
│  │  │  Volume:       │  │  Volume:       │  │   │
│  │  │  mysql_data    │  │  redis_data    │  │   │
│  │  └────────────────┘  └────────────────┘  │   │
│  └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## 구성 요소

### EC2 인스턴스

| 항목 | 값 |
|------|-----|
| AMI | Ubuntu 24.04 LTS (x86) |
| 인스턴스 유형 | t2.small |
| 스토리지 | 30GB gp3 |
| 탄력적 IP | 3.34.223.29 |
| 리전 | ap-northeast-2 (서울) |

### 보안 그룹

| 포트 | 소스 | 용도 |
|------|------|------|
| 22 (SSH) | 0.0.0.0/0 | SSH 접속, GitHub Actions CD |
| 80 (HTTP) | 0.0.0.0/0 | API + WebSocket |
| 3000 | 0.0.0.0/0 | 직접 접근 (테스트용) |

---

## 네트워크 흐름

### HTTP API 요청

```
Client → :80 (Nginx) → :3000 (app 컨테이너) → MySQL / Redis
```

### WebSocket (실시간 시세)

```
Twelve Data WS ──→ app (wsUpstream) ──→ tickProcessor ──→ Socket.IO ──→ Client
                                             │
                                         Redis 캐시
                                       (price:{symbol})
```

### CD 파이프라인

```
main push/merge
    │
    ▼
GitHub Actions (ubuntu-latest)
    │
    │  SSH (appleboy/ssh-action)
    ▼
EC2
    │
    ├── git pull origin main
    ├── docker compose build app
    ├── docker compose up -d
    └── docker compose exec -T app npm run migrate
```

---

## Docker 컨테이너

| 컨테이너 | 이미지 | 포트 | 볼륨 | 헬스체크 |
|----------|--------|------|------|---------|
| plainedu-app | 자체 빌드 (Dockerfile) | 3000 | - | depends_on |
| plainedu-mysql | mysql:8.0 | 3306 | mysql_data | mysqladmin ping |
| plainedu-redis | redis:7-alpine | 6379 | redis_data | redis-cli ping |

### 컨테이너 간 통신

Docker Compose 내부 네트워크에서 서비스명으로 통신:
- app → `mysql:3306` (DB_HOST=mysql)
- app → `redis:6379` (REDIS_URL=redis://redis:6379)

---

## 파일 구조

```
Plainedu-Backend/
├── Dockerfile              # Node.js 앱 이미지 빌드
├── .dockerignore            # Docker 빌드 제외 파일
├── docker-compose.yml       # app + mysql + redis 구성
├── nginx/
│   └── plainedu.conf        # Nginx 리버스 프록시 설정 (참고용)
├── .github/
│   └── workflows/
│       └── deploy.yml       # GitHub Actions CD 워크플로우
└── .env                     # 환경변수 (서버에만 존재, git 미추적)
```

---

## 환경변수

| 변수 | 설명 | Docker 값 |
|------|------|-----------|
| DB_HOST | MySQL 호스트 | `mysql` (서비스명) |
| DB_PORT | MySQL 포트 | `3306` |
| DB_USER | MySQL 사용자 | `plainedu` |
| DB_PASSWORD | MySQL 비밀번호 | (시크릿) |
| DB_NAME | 데이터베이스명 | `plainedu` |
| REDIS_URL | Redis 연결 URL | `redis://redis:6379` |
| JWT_ACCESS_SECRET | JWT 서명 키 | (시크릿) |
| TWELVEDATA_API_KEY | 시세 API 키 | (시크릿) |
| REALTIME_SYMBOLS | 실시간 구독 종목 | `AAPL,BTC/USD,EUR/USD` |
| PORT | 앱 포트 | `3000` |
