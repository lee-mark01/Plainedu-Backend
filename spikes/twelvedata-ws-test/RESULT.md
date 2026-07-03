# Twelve Data WebSocket Spike 테스트 결과

## 테스트 정보

- 브랜치: `spike/twelvedata-ws-test`
- API: Twelve Data WebSocket (`wss://ws.twelvedata.com/v1/quotes/price`)
- 플랜: Basic (Free)

---

## Basic 플랜 WebSocket 지원 범위

| 자산 유형 | 데이터 | 거래 시간 | 지원 여부 |
|-----------|--------|-----------|-----------|
| Crypto | Real-time | 24/7 | O |
| Forex | Real-time | 24/7 | O |
| United States (주식) | Real-time / EOD OTC | M-F 09:30~16:00 EDT | O |

Basic 플랜은 미국 시장 전체(주식/ETF), Forex, Crypto에 대해 real-time WebSocket 접근을 제공한다. 문서상 Trial symbol(AAPL, BTC/USD, EUR/USD)은 각 시장의 대표 샘플 심볼이며, "이것만 가능하다"는 의미가 아니다.

---

## 1차 테스트 — AAPL (장 마감 시간)

- 일시: 2026-06-24 09:50 (KST)
- 심볼: AAPL (NASDAQ)

| 단계 | 동작 | 결과 |
|------|------|------|
| 1/5 | WebSocket 연결 | OK |
| 2/5 | AAPL subscribe | OK — `COMMON_STOCK` |
| 3/5 | Heartbeat | OK — 3회 송수신 |
| 4/5 | Unsubscribe | OK |
| 5/5 | Reset + 종료 | OK — close code 1005 |

- price 이벤트: **0건** (미국 장 마감 시간이라 체결 없음)

---

## 2차 테스트 — BTC/USD (24시간 마켓)

- 일시: 2026-06-24 09:55 (KST)
- 심볼: BTC/USD (Coinbase Pro)

| 단계 | 동작 | 결과 |
|------|------|------|
| 1/5 | WebSocket 연결 | OK |
| 2/5 | BTC/USD subscribe | OK — `DIGITAL_CURRENCY` |
| 3/5 | Heartbeat | OK — 3회 송수신 |
| 4/5 | Unsubscribe | OK |
| 5/5 | Reset + 종료 | OK — close code 1005 |

- price 이벤트: **30건** (30초간 수신)
- 가격 범위: $62,906.30 ~ $62,918.58
- 수신 빈도: 약 1초당 1건

---

## 3차 테스트 — 멀티 심볼 BTC/USD + ETH/USD

- 일시: 2026-06-24 10:08 (KST)
- 심볼: BTC/USD, ETH/USD

| 단계 | 동작 | 결과 |
|------|------|------|
| 2/5 | subscribe | **warning** — BTC/USD 성공, ETH/USD 실패 |
| 나머지 | 동일 | BTC/USD만 30건 수신 |

- ETH/USD 실패: Basic 플랜에서 해당 심볼 구독 불가
- `status`가 `"ok"` 대신 `"warning"` — 부분 성공 시 warning 처리

---

## 4차 테스트 — 멀티 심볼 BTC/USD + EUR/USD

- 일시: 2026-06-24 10:12 (KST)
- 심볼: BTC/USD (Crypto), EUR/USD (Forex)

| 단계 | 동작 | 결과 |
|------|------|------|
| 1/5 | WebSocket 연결 | OK |
| 2/5 | subscribe | OK — 2심볼 모두 성공 |
| 3/5 | Heartbeat | OK |
| 4/5 | Unsubscribe | OK — 2심볼 모두 해제 |
| 5/5 | Reset + 종료 | OK |

- price 이벤트: **47건** (BTC/USD + EUR/USD 혼합 수신)
- BTC/USD: $62,897.20 ~ $62,911.31
- EUR/USD: $1.13741 ~ $1.13744 (FX 특성상 변동 적음)

### 발견 사항

1. **멀티 심볼 동시 구독 가능** — Free 플랜에서도 복수 심볼 구독 OK
2. **Forex는 `exchange` 필드 없음** — `"exchange"` 키 자체가 응답에 빠짐. `PHYSICAL CURRENCY`는 subscribe-status에서만 나옴
3. **자산 유형별 `type` 값**:
   - Crypto: `DIGITAL_CURRENCY` (subscribe) / `Digital Currency` (price)
   - Forex: `PHYSICAL_CURRENCY` (subscribe) / `Physical Currency` (price)
   - 주식: `COMMON_STOCK` (subscribe) / 장중 확인 필요

---

## 5차 테스트 — 문서 예시 심볼 추가 검증

- 일시: 2026-06-24 (KST)
- 심볼: TRP, QQQ, USD/JPY, ETH/BTC

| 심볼 | subscribe 결과 | price 수신 | 해석 |
|------|----------------|------------|------|
| TRP | success | 미수신 | NYSE 주식. 구독 가능 확인. 장외 시간이라 price 미수신 |
| QQQ | success | 미수신 | NASDAQ ETF. 구독 가능 확인. 장외 시간이라 price 미수신 |
| USD/JPY | **fails** | - | Basic/Trial 계정에서 구독 불가 |
| ETH/BTC | **fails** | - | Basic/Trial 계정에서 구독 불가 |

### 핵심 발견

문서 예시에 나온 심볼이라고 해서 전부 현재 계정에서 구독 가능한 것은 아니다. 실제 사용 가능 여부는 `subscribe-status`의 `success`/`fails`로 확인해야 한다.

---

## 6차 테스트 — 추가 Crypto 후보 12개 스캔

- 일시: 2026-06-24 (KST)
- 도구: `npm run scan` (scan-symbols.js)
- 심볼: ETH/USD, LTC/USD, XRP/USD, SOL/USD, DOGE/USD, ADA/USD, BCH/USD, LINK/USD, BNB/USD, DOT/USD, AVAX/USD, MATIC/USD

| 심볼 | subscribe 결과 |
|------|----------------|
| ETH/USD | **fails** |
| LTC/USD | **fails** |
| XRP/USD | **fails** |
| SOL/USD | **fails** |
| DOGE/USD | **fails** |
| ADA/USD | **fails** |
| BCH/USD | **fails** |
| LINK/USD | **fails** |
| BNB/USD | **fails** |
| DOT/USD | **fails** |
| AVAX/USD | **fails** |
| MATIC/USD | **fails** |

결과: **12개 전부 구독 실패.** Basic/Trial 계정에서 Crypto는 BTC/USD만 구독 가능한 것으로 확인됨.

---

## 심볼 검증 종합

### 즉시 price까지 검증 완료

| 심볼 | 자산 유형 | price 수신 |
|------|-----------|------------|
| BTC/USD | Crypto | OK |
| EUR/USD | Forex | OK |

### 구독 성공, 정규장 price 재검증 필요

| 심볼 | 자산 유형 | 비고 |
|------|-----------|------|
| AAPL | 주식 (NASDAQ) | 장외 시간 테스트 |
| TRP | 주식 (NYSE) | 장외 시간 테스트 |
| QQQ | ETF (NASDAQ) | 장외 시간 테스트 |

### 현재 계정에서 실패 (15개)

| 심볼 | 자산 유형 |
|------|-----------|
| ETH/USD | Crypto |
| LTC/USD | Crypto |
| XRP/USD | Crypto |
| SOL/USD | Crypto |
| DOGE/USD | Crypto |
| ADA/USD | Crypto |
| BCH/USD | Crypto |
| LINK/USD | Crypto |
| BNB/USD | Crypto |
| DOT/USD | Crypto |
| AVAX/USD | Crypto |
| MATIC/USD | Crypto |
| ETH/BTC | Crypto |
| USD/JPY | Forex |

---

## 전체 결론

| 항목 | 상태 |
|------|------|
| WebSocket 연결/인증 | OK |
| subscribe/unsubscribe/reset | OK |
| heartbeat 유지 | OK |
| 실시간 가격 수신 (Crypto) | OK |
| 실시간 가격 수신 (Forex) | OK |
| 실시간 가격 수신 (주식) | 장중 미확인 (구독 자체는 OK) |
| 멀티 심볼 동시 구독 | OK |
| API 키 유효성 | OK |

## 운영 전략

Twelve Data Basic/Trial 환경에서는 문서상 trial symbol과 실제 WebSocket 구독 가능 symbol이 완전히 일치하지 않을 수 있다. 따라서 전체 종목을 대상으로 검증하지 않고, **서비스에서 거래 가능하게 열 후보 종목만 선정한 뒤 `subscribe-status`의 `success`/`fails`를 기준으로 tradable whitelist를 구성한다.**

### 다음 단계

1. MVP 거래 가능 종목 후보 10~20개 선정
2. 해당 종목만 WebSocket subscribe 테스트 (`SYMBOLS=AAPL,MSFT,NVDA,...`)
3. success 종목 → `tradable_symbols` 화이트리스트 등록
4. 미국 정규장 시간(KST 22:30~05:00)에 `SYMBOLS=AAPL,TRP,QQQ`로 price 수신 최종 확인

## 운영 코드 이식 시 주의사항

- `day_volume`은 Crypto/Forex에서 미제공 → optional 처리 필요
- `exchange`는 Forex에서 미제공 → optional 처리 필요
- 자산 유형별 응답 구조 분기 필요:
  - 주식: `currency` 필드
  - Crypto/Forex: `currency_base` + `currency_quote` 필드
- `type` 필드 대소문자 불일치 주의 (`DIGITAL_CURRENCY` vs `Digital Currency`)
- `fails`는 성공 시 `null` (빈 배열 아님), 부분 실패 시 `status: "warning"`
- 특정 심볼(ETH/USD 등)은 Basic 플랜에서 지원 안 될 수 있음 → fails 응답 처리 필수

## 참고: 자산 유형별 서버 응답 구조 (RAW)

```json
// subscribe-status (성공)
{
  "event": "subscribe-status",
  "status": "ok",
  "success": [
    {"symbol": "BTC/USD", "exchange": "Coinbase Pro", "type": "DIGITAL_CURRENCY"},
    {"symbol": "EUR/USD", "exchange": "PHYSICAL CURRENCY", "type": "PHYSICAL_CURRENCY"}
  ],
  "fails": null
}

// subscribe-status (부분 실패)
{
  "event": "subscribe-status",
  "status": "warning",
  "success": [{"symbol": "BTC/USD", "exchange": "Coinbase Pro", "type": "DIGITAL_CURRENCY"}],
  "fails": [{"symbol": "ETH/USD"}]
}

// price — Crypto
{
  "event": "price",
  "symbol": "BTC/USD",
  "currency_base": "Bitcoin",
  "currency_quote": "US Dollar",
  "exchange": "Coinbase Pro",
  "type": "Digital Currency",
  "timestamp": 1782262560,
  "price": 62918.11
}

// price — Forex (exchange 필드 없음)
{
  "event": "price",
  "symbol": "EUR/USD",
  "currency_base": "Euro",
  "currency_quote": "US Dollar",
  "type": "Physical Currency",
  "timestamp": 1782263520,
  "price": 1.1374
}

// price — 주식 (장중 테스트 시 예상)
{
  "event": "price",
  "symbol": "AAPL",
  "currency": "USD",
  "exchange": "NASDAQ",
  "type": "Common Stock",
  "timestamp": 1592249566,
  "price": 342.0157,
  "day_volume": 27631112
}

// heartbeat
{"event": "heartbeat", "status": "ok"}
```
