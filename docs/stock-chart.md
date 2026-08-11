# 시세 차트 백엔드 — API · 실시간 계약

> 데이터 소스: Twelve Data (REST + WebSocket) · 캐시: Redis · 실시간: Socket.IO
> 원칙: 차트/시세 데이터는 DB에 저장하지 않는다. 외부 API의 사본이므로 Redis 캐시만 사용.

## 실행 준비

```bash
# 1. Redis (Docker)
docker run -d --name plainedu-redis -p 6379:6379 redis:7-alpine

# 2. .env
TWELVEDATA_API_KEY=<발급 키>
REDIS_URL=redis://localhost:6379
REALTIME_SYMBOLS=AAPL,BTC/USD,EUR/USD   # 무료 플랜 최대 8종목

# 3. 실행
npm run dev
```

Redis가 죽어 있어도 서버는 동작한다(캐시 없이 외부 API 직행 — 크레딧 소모만 늘어남).

---

## REST API

### `GET /api/stocks/:symbol/chart?range=1D`

차트 데이터. `range`: `1D` `1W` `3M` `1Y` `5Y` `ALL` (기본 `1D`)

`:symbol`은 미국 주식(`AAPL`, `BRK.B`) 또는 크립토/외환 페어(`BTC/USD`, `EUR/USD`).
**페어의 슬래시는 반드시 URL 인코딩(`%2F`)**: `GET /api/stocks/BTC%2FUSD/chart?range=1D`
(`encodeURIComponent(symbol)` 사용하면 됨. 인코딩 없이 보내면 404)

```json
{
  "success": true,
  "data": {
    "symbol": "AAPL",
    "interval": "1day",
    "range": "1Y",
    "currency": "USD",
    "timezone": "America/New_York",
    "exchange": "NASDAQ",
    "candles": [
      { "time": "2026-02-19", "open": 262.6, "high": 264.48, "low": 260.05, "close": 260.58, "volume": 30845300 }
    ],
    "high": 317.4,
    "low": 245.51
  }
}
```

**프론트 주의사항**
- `time` 포맷은 Lightweight Charts 입력 규격 그대로: 일봉 이상(`3M/1Y/5Y/ALL`) = `"YYYY-MM-DD"` 문자열, 분봉(`1D/1W`) = **unix 초(UTC)** → 둘 다 변환 없이 `setData()`에 바로 사용. 분봉 time은 Socket.IO 틱의 `timestamp`와 같은 기준
- 소수 반올림(`toFixed(2)`)은 프론트 담당 — 백엔드는 원시 숫자 유지
- 라인차트 = `close`, 캔들차트 = `open/high/low/close`. 양봉/음봉 색은 Lightweight Charts 기본 판단(종가>시가) 사용
- `high`/`low`는 요청한 range 구간의 최고/최저 (헤더 라벨용)

**과거 드래그 (lazy 로딩)** — `1D`/`1W`(분봉)만 지원:
`GET /api/stocks/:symbol/chart?range=1D&before=1783026900`
보유한 가장 오래된 봉의 `time`(unix 초)을 `before`로 그대로 넘기면 그 이전 구간을 반환(중복 봉 제거됨). 일봉 이상은 기본 응답이 전체 이력을 커버하므로 불필요.

**에러**: 없는 심볼 `404` · 크레딧 소진 `429` · 제공사 오류 `502` · 제공사 연결 실패 `503`

### `GET /api/stocks/:symbol/quote`

헤더(현재가·등락액·등락률) 초기값. 이후 갱신은 Socket.IO로.

```json
{
  "success": true,
  "data": {
    "symbol": "AAPL",
    "price": 260.58,
    "prevClose": 258.1,
    "change": 2.48,
    "changePercent": 0.96,
    "timestamp": "2026-07-03",
    "source": "close",
    "marketOpen": false
  }
}
```

- `source`: `"ws"`(장중 실시간 틱) 또는 `"close"`(마지막 일봉 종가)
- `timestamp`: `source=ws`이면 Unix timestamp(UTC, 초), `close`이면 거래소 로컬 날짜 문자열

### `GET /api/stocks/search?keyword=애플&limit=20`

Stocks 테이블 종목 검색 (검색바). `[{ stock_code, name, market }]`

---

## Socket.IO 실시간 계약

서버 포트에 기본 경로(`/socket.io`)로 연결.

```js
const socket = io('http://localhost:3000');
socket.emit('subscribe', { symbol: 'AAPL' });
```

### 이벤트

| 방향 | 이벤트 | 페이로드 | 설명 |
|---|---|---|---|
| C→S | `subscribe` | `{ symbol: string }` | 종목 room 입장 요청 |
| C→S | `unsubscribe` | `{ symbol: string }` | room 퇴장 요청 |
| S→C | `subscribed` | `{ symbol }` | 구독 성공 ack |
| S→C | `subscribe-error` | `{ symbol, message }` | 구독 거부 (사유는 아래 표) |
| S→C | `price` | `{ symbol, price, change, changePercent, timestamp }` | 틱 (장중에만 발생) |
| S→C | `resync` | `{ symbol }` | 업스트림 재연결 — 차트 REST 재조회 권장 |

- `subscribe`/`unsubscribe`의 `symbol`은 인코딩 없이 그대로 전달(`{ symbol: 'BTC/USD' }`) — URL 인코딩은 REST 경로에만 해당.
- `timestamp`는 unix 초(UTC) — 분봉 차트의 `time`과 같은 기준이라 변환 없이 그대로 사용 가능(일봉 차트의 마지막 봉을 갱신할 때만 날짜 문자열로 바꿔서 사용).
- 틱 수신 시: 헤더 숫자 갱신 + `series.update()`로 마지막 봉 갱신.
- 미국 주식은 장마감 시간에 틱이 없다 → 마지막 종가에서 정지가 정상 동작. 크립토/외환(`BTC/USD`, `EUR/USD`)은 24/7 틱 수신.

### `subscribe-error`의 `message` 사유

| 상황 | message |
|---|---|
| 소켓당 구독 한도 초과(기본 5개, `WS_MAX_VIEW_PER_SOCKET`) | `소켓당 최대 N종목까지 구독할 수 있습니다.` |
| 존재하지 않거나 비활성 종목 / core 목록에 없는 크립토·외환 | `실시간 시세를 제공하지 않는 종목입니다.` |
| 서버 내부 검증 오류(DB 조회 실패 등, 일시적) | `일시적 오류로 구독할 수 없습니다.` |

같은 심볼로 짧은 시간에 중복 `subscribe`를 보내도 검증은 1회만 일어나고 두 요청 모두 같은 결과를 받는다(서버가 진행 중인 검증을 공유).

### 구독 가능 종목 — 더 이상 고정 목록이 아님 ⚠️

과거엔 `.env`의 `REALTIME_SYMBOLS`(고정 목록)에 있는 종목만 구독 가능했지만, 이제는 **태그 기반 동적 구독**(`docs/market-data-strategy.md` 참고)으로 바뀌었다:

- **주식**: DB(`Stocks` 테이블)에 존재하고 `status = 'ACTIVE'`면 `REALTIME_SYMBOLS` 목록 밖이어도 구독 가능. 즉 프론트는 사실상 "차트 상세페이지를 연 종목이면 아무거나" `subscribe`를 보내면 된다 — 서버가 서버 사이드에서 검증하고 실제 업스트림 구독까지 자동으로 처리한다.
- **크립토/외환**(심볼에 `/` 포함): DB에 행 자체가 없어서(market ENUM이 NASDAQ/NYSE뿐) `REALTIME_SYMBOLS`(=core) 목록 소속 여부로만 판별한다. 즉 크립토/외환은 여전히 core 목록에 있는 것만 구독 가능.
- 유저가 실제 보유 중인 종목은 서버가 1분마다 자동으로(랭킹 배치와 함께) 구독을 유지하므로, 프론트가 보유종목에 대해 별도로 `subscribe`를 안 보내도 언젠가는(최대 1분 내) 살아있는 가격을 받게 된다 — 다만 즉시 실시간을 원하면 상세페이지 진입 시 `subscribe`를 보내는 게 맞다(그래야 즉시 반영).

**종목 추가/변경**: core(=`.env`의 `REALTIME_SYMBOLS`, 없으면 코드 상수 `CORE_SYMBOLS`)는 여전히 재배포로만 바뀐다. 다만 이제 core는 "항상 실시간인 최소 보장 목록"일 뿐, 구독 가능 범위 자체를 제한하지 않는다(주식 한정).

### 소켓 종료 시 자동 정리

탭을 닫거나 연결이 끊기면 그 소켓이 구독했던 종목들이 서버에서 자동으로 정리된다(별도 이벤트 불필요). 다만 실제 업스트림(Twelve Data) 구독 해제는 즉시가 아니라 5분 유예 후 일어난다 — 프론트 입장에서 신경 쓸 부분은 아니고, 짧은 시간 안에 재접속/재구독해도 끊김 없이 이어진다는 뜻.

**24/7 마켓 동작 차이**: 심볼에 `/`가 포함되면 24/7 마켓으로 간주 → 캐시 TTL 항상 장중 기준, `quote.marketOpen`은 항상 `true`. 외환은 `volume`이 없어 캔들의 `volume`이 `null`, `currency`는 호가 통화(`currency_quote`)로 채워짐.

---

## Redis 키 계약 (도메인 간 인터페이스)

| 키 | 쓰는 쪽 | 읽는 쪽 | 내용 |
|---|---|---|---|
| `chart:{symbol}:{interval}` | chart | chart, marketData(전일종가) | 정규화된 봉 배열, 장중/마감 동적 TTL |
| `price:{symbol}` | marketData | trading, portfolio | 현재가 1개 `{ symbol, price, timestamp, currency, exchange, dayVolume }`, TTL 60초 |

**trading/portfolio 팀**: 시장가 체결·평가금 계산 시 외부 API를 직접 호출하지 말고 반드시 `price:{symbol}`을 읽을 것. 키가 없으면(장마감·틱 공백) `chart:{symbol}:1day` 마지막 봉 close로 폴백하거나 `chart.service.getQuote()`를 사용.
