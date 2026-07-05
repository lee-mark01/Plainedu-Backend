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

| 방향 | 이벤트 | 페이로드 | 설명 |
|---|---|---|---|
| C→S | `subscribe` | `{ symbol }` | 종목 room 입장 |
| C→S | `unsubscribe` | `{ symbol }` | room 퇴장 |
| S→C | `subscribed` | `{ symbol }` | 구독 성공 ack |
| S→C | `subscribe-error` | `{ symbol, message }` | 미제공 종목 |
| S→C | `price` | `{ symbol, price, change, changePercent, timestamp }` | 틱 (장중에만 발생) |
| S→C | `resync` | `{ symbol }` | 업스트림 재연결 — 차트 REST 재조회 권장 |

- `timestamp`는 unix 초(UTC) — 분봉 차트의 `time`과 같은 기준이라 변환 없이 그대로 사용 가능 (일봉 차트의 마지막 봉을 갱신할 때만 날짜 문자열로 바꿔서 사용)
- 틱 수신 시: 헤더 숫자 갱신 + `series.update()`로 마지막 봉 갱신
- 미국 주식은 장마감 시간에 틱이 없다 → 마지막 종가에서 정지가 정상 동작. 크립토/외환(`BTC/USD`, `EUR/USD`)은 24/7 틱 수신
- 구독 가능 종목 = `REALTIME_SYMBOLS` 목록 (무료 플랜 한도로 6~8종목). Socket.IO의 `subscribe` 페이로드에는 인코딩 없이 `{ symbol: 'BTC/USD' }` 그대로 전달 (URL 인코딩은 REST 경로에만 해당)

**종목 변경**: `.env`의 `REALTIME_SYMBOLS`만 바꾸면 됨(코드 수정 불필요). 단, 플랜에 따라 일부 심볼은 구독이 거부되므로(스파이크 결과: 크립토 중 BTC/USD만 성공) 서버 기동 후 `[wsUpstream] 구독 성공/실패` 로그로 실제 화이트리스트를 확인할 것.

**24/7 마켓 동작 차이**: 심볼에 `/`가 포함되면 24/7 마켓으로 간주 → 캐시 TTL 항상 장중 기준, `quote.marketOpen`은 항상 `true`. 외환은 `volume`이 없어 캔들의 `volume`이 `null`, `currency`는 호가 통화(`currency_quote`)로 채워짐.

---

## Redis 키 계약 (도메인 간 인터페이스)

| 키 | 쓰는 쪽 | 읽는 쪽 | 내용 |
|---|---|---|---|
| `chart:{symbol}:{interval}` | chart | chart, marketData(전일종가) | 정규화된 봉 배열, 장중/마감 동적 TTL |
| `price:{symbol}` | marketData | trading, portfolio | 현재가 1개 `{ symbol, price, timestamp, currency, exchange, dayVolume }`, TTL 60초 |

**trading/portfolio 팀**: 시장가 체결·평가금 계산 시 외부 API를 직접 호출하지 말고 반드시 `price:{symbol}`을 읽을 것. 키가 없으면(장마감·틱 공백) `chart:{symbol}:1day` 마지막 봉 close로 폴백하거나 `chart.service.getQuote()`를 사용.
