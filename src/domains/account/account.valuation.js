// 계좌 평가 진입점 
// 산식은 전부 calculator(순수 함수)에 있고, 여기는 데이터 수집 + 가격 조회 + write-back 오케스트레이션만.
const pool = require('../../config/db');
const redis = require('../../config/redis');
const AppError = require('../../errors/AppError');
const accountRepository = require('./account.repository');
const chartService = require('../stock/chart.service');
const { buildValuation } = require('./account.valuation.calculator');

const WRITE_BACK_CHUNK_SIZE = 500;

// --- REST 한도(429) 페이싱 ---
// TwelveData 무료 플랜은 분당 8크레딧. 콜드 캐시에서 심볼을 동시 발사하면 초과분이 429로
// 떨어져 어떤 계좌가 skipped될지 운으로 정해진다 (docs/market-data-strategy.md P3).
// 대응: 1차는 동시 실행 그대로 두고(캐시 히트 = 크레딧 0이라 게이트하면 배치만 느려짐),
// 429로 실패한 심볼만 윈도 리셋을 기다렸다가 분당 예산 단위로 재시도한다.
// 재시도 대기는 배치(waitForRateLimit) 전용 — 단건(/me)은 유저가 기다리는 경로라
// 기존 D4(평단가+stale)로 즉시 응답한다.
const CREDITS_PER_MINUTE = Number(process.env.TWELVEDATA_CREDITS_PER_MINUTE) || 8;
const RATE_WINDOW_MS = Number(process.env.TWELVEDATA_RATE_WINDOW_MS) || 61_000; // 분당 윈도 + 여유 1초
const RATE_RETRY_ROUNDS = Number(process.env.TWELVEDATA_RATE_RETRY_ROUNDS) || 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRateLimited = (reason) => reason?.status === 429; // twelvedata.client가 한도 초과를 AppError(429)로 던짐

// 시세 기준 시점 표기 (A-3, 프론트 신선도 배지 재료)
// ws 틱: Unix 초 → ISO 시각 / close(일봉): 기준 거래일 문자열(YYYY-MM-DD) 그대로 — 형식이 다른 건
// 의미가 다르기 때문(순간 vs 거래일). 소비자는 price_source로 구분한다.
const toPricedAt = (source, timestamp) => {
  if (timestamp == null) return null;
  return source === 'ws' ? new Date(timestamp * 1000).toISOString() : String(timestamp);
};

// getQuote 일괄 실행: 성공은 priceMap·priceMeta에 기록, 429 심볼만 반환. 그 외 실패는 null 확정(D4)
const quoteInto = async (priceMap, priceMeta, symbols) => {
  const settled = await Promise.allSettled(symbols.map((s) => chartService.getQuote(s)));
  const rateLimited = [];
  symbols.forEach((symbol, i) => {
    if (settled[i].status === 'fulfilled') {
      const quote = settled[i].value;
      priceMap[symbol] = quote.price;
      priceMeta[symbol] = { source: quote.source, priced_at: toPricedAt(quote.source, quote.timestamp) };
    } else if (isRateLimited(settled[i].reason)) {
      rateLimited.push(symbol);
    } else {
      priceMap[symbol] = null;
      console.warn(`[valuation] 가격 조회 실패: ${symbol} — ${settled[i].reason?.message}`);
    }
  });
  return rateLimited;
};

// distinct 심볼별 가격 1회 조회 (D3). 실패 심볼은 null → calculator가 D4 정책(평단가+stale) 적용
// 1차: WS 틱(price:{symbol}, TTL 60s) 일괄 mget — 장중엔 여기서 끝나 외부 API 크레딧 0
// 2차: 틱 없는 심볼(장외·미구독)만 getQuote 폴백 (장외엔 일봉 마지막 종가 = 동일 값)
// 3차(배치 전용): 429 심볼만 윈도 리셋 대기 후 분당 예산 단위 재시도 — 위 페이싱 주석 참조
// 반환: { priceMap: {심볼: 가격|null}, priceMeta: {심볼: {source, priced_at}} }
// priceMap은 calculator 계약(스펙 §4.1) 그대로, priceMeta는 신선도 표시용 부가 정보(실패 심볼은 없음)
const fetchPriceMap = async (symbols, { waitForRateLimit = false } = {}) => {
  const unique = [...new Set(symbols)];
  if (!unique.length) return { priceMap: {}, priceMeta: {} };
  const priceMap = {};
  const priceMeta = {};

  let ticks;
  try {
    ticks = await redis.mget(unique.map((s) => `price:${s}`));
  } catch (err) {
    console.warn(`[valuation] 틱 일괄 조회 실패 — 전 심볼 getQuote 폴백: ${err.message}`);
    ticks = unique.map(() => null);
  }

  const missing = [];
  unique.forEach((symbol, i) => {
    let tick = null;
    try {
      tick = ticks[i] ? JSON.parse(ticks[i]) : null;
    } catch { /* 손상된 틱은 폴백으로 */ }
    if (typeof tick?.price === 'number') {
      priceMap[symbol] = tick.price;
      priceMeta[symbol] = { source: 'ws', priced_at: toPricedAt('ws', tick.timestamp) };
    } else {
      missing.push(symbol);
    }
  });

  let rateLimited = await quoteInto(priceMap, priceMeta, missing);

  for (let round = 1; waitForRateLimit && rateLimited.length && round <= RATE_RETRY_ROUNDS; round += 1) {
    console.warn(
      `[valuation] 한도(429) 심볼 ${rateLimited.length}개 — ${RATE_WINDOW_MS / 1000}초 후 재시도 (${round}/${RATE_RETRY_ROUNDS}회차)`
    );
    await sleep(RATE_WINDOW_MS);
    const chunk = rateLimited.slice(0, CREDITS_PER_MINUTE);
    const rest = rateLimited.slice(CREDITS_PER_MINUTE);
    // 또 429면 줄 뒤로 보낸다 — 같은 심볼이 예산을 독점하지 않고 전 심볼이 돌아가며 기회를 얻도록
    rateLimited = [...rest, ...(await quoteInto(priceMap, priceMeta, chunk))];
  }

  // 남은 429는 실패 확정 — 배치는 해당 계좌 skipped(직전 값 유지), 다음 주기가 캐시 누적으로 회복
  for (const symbol of rateLimited) {
    priceMap[symbol] = null;
    console.warn(`[valuation] 가격 조회 실패(한도 초과 지속): ${symbol}`);
  }
  return { priceMap, priceMeta };
};

// 단건: 항상 라이브 계산 (내 계좌 1개는 저렴) — 홈/투자 페이지용
const getAccountValuation = async (accountId) => {
  const account = await accountRepository.findAccountById(pool, accountId);
  if (!account) throw new AppError('계좌를 찾을 수 없습니다.', 404);

  const holdings = await accountRepository.findHoldingsByAccountId(pool, accountId);
  const { priceMap, priceMeta } = await fetchPriceMap(holdings.map((h) => h.stock_code));

  const valuation = buildValuation({
    initial_cash: account.initial_cash,
    cash_balance: account.cash_balance,
    holdings,
    priceMap,
  });

  // 신선도 표시(A-3): 프론트가 "실시간(ws) / 어느 거래일 종가(close) 기준"인지 배지를 달 수 있도록
  // 보유별 시세 출처·기준 시점을 부가한다. stale(가격 실패→평단가) 보유는 둘 다 null.
  valuation.holdings = valuation.holdings.map((h) => ({
    ...h,
    price_source: priceMeta[h.stock_code]?.source ?? null,
    priced_at: priceMeta[h.stock_code]?.priced_at ?? null,
  }));
  return valuation;
};

// 배치: 시즌 전 계좌 일괄 평가 — 랭킹 스케줄러용 
// 가격 실패 종목을 보유한 계좌는 skipped로 분리 (D4 배치 정책: ZSET·write-back 미갱신 → 직전 값 유지)
const valuateSeasonAccounts = async (seasonId, { writeBack = false } = {}) => {
  const [accounts, allHoldings] = await Promise.all([
    accountRepository.findAccountsBySeason(pool, seasonId),
    accountRepository.findHoldingsBySeason(pool, seasonId),
  ]);

  const holdingsByAccount = new Map();
  for (const h of allHoldings) {
    if (!holdingsByAccount.has(h.account_id)) holdingsByAccount.set(h.account_id, []);
    holdingsByAccount.get(h.account_id).push(h);
  }

  // 배치는 429 심볼을 기다렸다 재시도 (계좌가 운으로 skipped되는 것 방지 — 페이싱 주석 참조)
  // priceMeta(신선도)는 단건 /me 전용이라 배치 결과에는 싣지 않는다 (랭킹·write-back은 미사용)
  const { priceMap } = await fetchPriceMap(allHoldings.map((h) => h.stock_code), { waitForRateLimit: true });

  const results = [];
  const skipped = [];
  for (const account of accounts) {
    const valuation = buildValuation({
      initial_cash: account.initial_cash,
      cash_balance: account.cash_balance,
      holdings: holdingsByAccount.get(account.id) || [],
      priceMap,
    });
    if (valuation.has_stale_prices) {
      // 랭킹이 skipped 멤버를 ZSET 제거 대상에서 보호(직전 점수 유지)할 수 있도록 식별자 포함
      skipped.push({
        account_id: account.id,
        account_type: account.account_type,
        user_id: account.user_id,
        team_id: account.team_id,
        stale_symbols: valuation.stale_symbols,
      });
      continue;
    }
    results.push({
      account_id: account.id,
      account_type: account.account_type,
      user_id: account.user_id,
      team_id: account.team_id,
      school_group: account.school_group,
      ...valuation,
    });
  }

  if (writeBack) {
    const rows = results.map((r) => ({
      id: r.account_id,
      total_equity: r.total_equity,
      current_return_rate: r.return_rate ?? 0, // 컬럼 NOT NULL 방어 (initial_cash≤0 케이스)
    }));
    for (let i = 0; i < rows.length; i += WRITE_BACK_CHUNK_SIZE) {
      await accountRepository.bulkUpdateEquity(pool, rows.slice(i, i + WRITE_BACK_CHUNK_SIZE));
    }
  }

  return { valuated_at: new Date().toISOString(), results, skipped };
};

module.exports = { getAccountValuation, valuateSeasonAccounts, fetchPriceMap };
