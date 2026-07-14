// 계좌 평가 진입점 — 스펙: docs/specs/spec-account-valuation.md §4.2
// 산식은 전부 calculator(순수 함수)에 있고, 여기는 데이터 수집 + 가격 조회 + write-back 오케스트레이션만.
const pool = require('../../config/db');
const AppError = require('../../errors/AppError');
const accountRepository = require('./account.repository');
const chartService = require('../stock/chart.service');
const { buildValuation } = require('./account.valuation.calculator');

const WRITE_BACK_CHUNK_SIZE = 500;

// distinct 심볼별 getQuote 1회 (D3). 실패 심볼은 null → calculator가 D4 정책(평단가+stale) 적용
const fetchPriceMap = async (symbols) => {
  const unique = [...new Set(symbols)];
  const settled = await Promise.allSettled(unique.map((s) => chartService.getQuote(s)));
  const priceMap = {};
  unique.forEach((symbol, i) => {
    if (settled[i].status === 'fulfilled') {
      priceMap[symbol] = settled[i].value.price;
    } else {
      priceMap[symbol] = null;
      console.warn(`[valuation] 가격 조회 실패: ${symbol} — ${settled[i].reason?.message}`);
    }
  });
  return priceMap;
};

// 단건: 항상 라이브 계산 (내 계좌 1개는 저렴) — 홈/투자 페이지용
const getAccountValuation = async (accountId) => {
  const account = await accountRepository.findAccountById(pool, accountId);
  if (!account) throw new AppError('계좌를 찾을 수 없습니다.', 404);

  const holdings = await accountRepository.findHoldingsByAccountId(pool, accountId);
  const priceMap = await fetchPriceMap(holdings.map((h) => h.stock_code));

  return buildValuation({
    initial_cash: account.initial_cash,
    cash_balance: account.cash_balance,
    holdings,
    priceMap,
  });
};

// 배치: 시즌 전 계좌 일괄 평가 — 랭킹 스케줄러용 (스펙 §4.2)
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

  const priceMap = await fetchPriceMap(allHoldings.map((h) => h.stock_code));

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
      skipped.push({ account_id: account.id, stale_symbols: valuation.stale_symbols });
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
