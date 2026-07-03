# 미국 주식 종목 마이그레이션

## 작업 내용

### 1. DB 마이그레이션 도구 도입 (db-migrate)

기존에는 `db/schema.sql` 하나로 스키마를 관리했는데, 팀원 간 스키마 변경 사항을 동기화하기 위해 db-migrate를 도입했다.

- 변경 이력이 번호 붙은 파일로 관리됨
- DB에 `migrations` 테이블이 생겨서 어디까지 적용됐는지 자동 추적
- `npm run migrate`만 치면 아직 안 적용된 것만 순서대로 실행

```
db/
  migrations/
    20260101000000-initial-schema.js     ← 기존 schema.sql 기준선
    20260703000001-us-stocks-schema.js   ← 이번 변경
    sqls/
      ...
```

### 2. Stocks 테이블 미국장으로 변경

한국장(KOSPI/KOSDAQ) → 미국장(NASDAQ/NYSE)으로 전환했다.

| 변경 항목 | 이전 | 이후 |
|---|---|---|
| `market` ENUM | `KOSPI`, `KOSDAQ` | `NASDAQ`, `NYSE` |
| `currency` 컬럼 | 없음 | `VARCHAR(10) DEFAULT 'USD'` 추가 |

> 마이그레이션 실행 시 기존 Stocks 관련 데이터(Stocks, Watchlist, AccountHoldings, Orders, PortfolioAllocations, PostStockTags)가 초기화된다. 테스트 데이터만 있다면 그냥 진행해도 됨.

### 3. 미국 주식 종목 시딩

Twelve Data REST API(`/stocks`)를 통해 NASDAQ, NYSE 전체 종목을 DB에 삽입했다.

- NASDAQ: 4,521개
- NYSE: 3,088개
- **총 7,609개**

---

## 팀원 체크리스트

PR 머지 후 아래 순서대로 실행.

### 1. `.env`에 API 키 추가

```
TWELVEDATA_API_KEY=키값_공유받기
```

### 2. 패키지 설치

```bash
npm install
```

### 3. 마이그레이션 실행

```bash
npm run migrate
```

이미 DB가 있는 경우 → Stocks 관련 테이블 데이터가 초기화되고 ENUM이 변경됨.
DB가 없는 경우 → 전체 스키마가 새로 생성됨.

### 4. 종목 시딩

```bash
npm run seed:stocks
```

NASDAQ + NYSE 7,609개 종목이 Stocks 테이블에 삽입됨. 이미 있는 종목은 스킵됨(중복 실행 안전).

---

## 추가된 npm scripts

| 커맨드 | 설명 |
|---|---|
| `npm run migrate` | 미적용 마이그레이션 순서대로 실행 |
| `npm run migrate:down` | 마지막 마이그레이션 롤백 |
| `npm run seed:stocks` | 미국 주식 전체 종목 시딩 |
