# 배포 가이드

## 개요

AWS EC2에 Docker 기반으로 백엔드를 배포하고, GitHub Actions를 통해 자동 배포(CD)를 구성한다.

---

## 사전 준비

| 항목 | 설명 |
|------|------|
| AWS 계정 | EC2 인스턴스 생성 권한 |
| GitHub PAT | `repo` 스코프, EC2에서 git pull용 |
| `.pem` 키 파일 | EC2 SSH 접속 + GitHub Secrets 등록용 |

---

## 1. EC2 인스턴스 생성

- **AMI**: Ubuntu 24.04 LTS (x86)
- **인스턴스 유형**: t2.small
- **스토리지**: 30GB (gp3)
- **키 페어**: `plainedu-backend.pem`
- **보안 그룹 인바운드 규칙**:

| 포트 | 프로토콜 | 소스 | 용도 |
|------|----------|------|------|
| 22 | TCP | 0.0.0.0/0 | SSH (CD + 관리) |
| 80 | TCP | 0.0.0.0/0 | HTTP (Nginx) |
| 3000 | TCP | 0.0.0.0/0 | 직접 접근 (테스트용) |

- **탄력적 IP** 할당 후 인스턴스에 연결 → IP 고정

---

## 2. EC2 서버 초기 세팅

### SSH 접속

```bash
chmod 400 plainedu-backend.pem
ssh -i plainedu-backend.pem ubuntu@<EC2_PUBLIC_IP>
```

### 패키지 설치

```bash
# 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# Docker 설치
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker

# Nginx 설치
sudo apt install -y nginx
```

### 프로젝트 클론

```bash
cd ~
git clone https://<GITHUB_PAT>@github.com/Plain-edu/Plainedu-Backend.git
```

---

## 3. 환경변수 설정

```bash
cd ~/Plainedu-Backend
nano .env
```

```
PORT=3000

# DB (docker-compose 서비스명)
DB_HOST=mysql
DB_PORT=3306
DB_USER=plainedu
DB_PASSWORD=<비밀번호>
DB_NAME=plainedu

# Redis (docker-compose 서비스명)
REDIS_URL=redis://redis:6379

# JWT
JWT_ACCESS_SECRET=<시크릿>
JWT_ACCESS_EXPIRES_IN=15m

# Twelve Data
TWELVEDATA_API_KEY=<API키>
REALTIME_SYMBOLS=AAPL,BTC/USD,EUR/USD
PRICE_TTL_SECONDS=60

# OAuth (필요 시 추가)
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
KAKAO_REDIRECT_URI=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
CAREERNET_API_KEY=
```

---

## 4. Nginx 설정

```bash
sudo rm /etc/nginx/sites-enabled/default
sudo nano /etc/nginx/sites-available/plainedu
```

내용:

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/plainedu /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 5. 첫 배포 (수동)

```bash
cd ~/Plainedu-Backend
docker compose up -d --build
docker compose exec app npm run migrate
```

### 확인

```
http://<EC2_PUBLIC_IP>/api/health
→ {"success":true,"message":"Server is running"}
```

---

## 5-1. 첫 관리자 지정 (수동, 한 번)

관리자 권한은 `Users.role = 'ADMIN'`으로 판정한다. 승격 API를 두지 않았으므로 **첫 관리자는
사람이 직접 지정한다** — 관리자가 한두 명인 동안은 API가 공격면만 넓힌다.

운영자가 먼저 소셜 로그인으로 계정을 만든 뒤, 그 이메일로 실행한다.

```bash
docker compose exec db mysql -u root -p"$DB_PASSWORD" "$DB_NAME" \
  -e "UPDATE Users SET role = 'ADMIN' WHERE email = '<운영자 이메일>';"
```

확인:

```bash
docker compose exec db mysql -u root -p"$DB_PASSWORD" "$DB_NAME" \
  -e "SELECT id, email, role FROM Users WHERE role = 'ADMIN';"
```

> ⚠️ **승격 후 재로그인이 필요하다.** `role`은 액세스 토큰에 담기므로 이미 발급된 토큰은
> 여전히 `USER`다. 로그아웃 후 다시 로그인하거나 토큰을 갱신해야 `/api/admin/*`이 열린다.

관리자 전용 경로는 `/api/admin/*`이며 신고 목록·제재 부과·이의신청 처리를 담당한다.
전용 화면이 없는 동안에는 Swagger UI(`/api-docs`)에서 Authorize 후 직접 호출하면 된다.

---

## 6. GitHub Actions CD 설정

### GitHub Secrets 등록

GitHub → 리포 → Settings → Secrets and variables → Actions:

| Secret 이름 | 값 |
|-------------|-----|
| `EC2_HOST` | EC2 탄력적 IP |
| `EC2_SSH_KEY` | `.pem` 파일 내용 전체 |

### 자동 배포 흐름

```
main에 PR 머지/push → GitHub Actions → SSH로 EC2 접속 → git pull → docker build → up → migrate
```

---

## 유용한 명령어

```bash
# 로그 확인
docker compose logs -f app

# 컨테이너 상태
docker compose ps

# 앱만 재시작
docker compose restart app

# 전체 재빌드
docker compose up -d --build

# 마이그레이션
docker compose exec app npm run migrate

# 컨테이너 전체 중지
docker compose down
```
