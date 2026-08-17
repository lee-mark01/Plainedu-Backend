// 랭킹 1분 스케줄러  — 장중 라이브 ZSET 갱신 전용.
// ⚠️ 단일 인스턴스 전제: in-flight 가드(running)는 프로세스 로컬이다. pm2 cluster 등으로
//   서버를 2개 이상 띄우면 크론이 중복 실행돼 TwelveData 크레딧이 배수 소모된다(데이터는
//   UPSERT 멱등이라 무사). 다중 인스턴스 전환 시 Redis 락(SET NX)으로 교체할 것.
// 캐시 워밍 겸용: 매분 recompute가 보유 종목 일봉 캐시를 리필 → /me·관심종목 조회 상시 히트
//   (docs/market-data-strategy.md A-2). "마감 후 1회 스냅샷"은 16:05 ET 별도 크론 소관 —
//   여기서는 open→closed 전이를 감지하지 않고 isMarketOpen 가드만 둔다.
const cron = require('node-cron');
const { isMarketOpen, getEtDateString } = require('../config/marketHours');
const redis = require('../config/redis');
const accountService = require('../domains/account/account.service');
const rankingService = require('../domains/ranking/ranking.service');
const subscriptions = require('../marketData/subscriptions');
const { getQaConfig } = require('../config/qa');

let task = null;
let snapshotTask = null;
let heldTask = null;
let running = false; // in-flight 가드: 1분 틱·스냅샷이 공유 (recompute 동시 실행 방지)
let heldRunning = false; // held 동기화 전용 가드 — running(429 페이싱)과 완전 분리
let warnedNoSeason = false; // 활성 시즌 없음 경고를 매분 도배하지 않도록 1회만
let warnedHeldNoSeason = false;

// 스냅샷 전 대기: 15:59~16:00 틱이 429 페이싱으로 아직 도는 중이면 끝날 때까지 폴링 (최대 5분)
const waitForIdle = async (timeoutMs = 5 * 60 * 1000, intervalMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (running && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return !running;
};

const tick = async () => {
  if (!isMarketOpen()) return; // 장외: 조용히 skip (스펙 Success Criteria)

  // 배치가 429 페이싱으로 최대 ~2분 걸릴 수 있음 → 다음 틱 skip이 정상 동작 
  if (running) {
    console.warn('[rankingScheduler] 직전 실행이 아직 진행 중 — 이번 틱 skip');
    return;
  }

  running = true;
  const startedAt = Date.now();
  try {
    // 패시브 잡: 활성 시즌이 없으면 새로 만들지 않고 skip (getOrCreateActiveSeason의 자동생성 회피)
    const season = await accountService.getActiveSeason();
    if (!season) {
      if (!warnedNoSeason) {
        console.warn('[rankingScheduler] 활성 시즌 없음 — 재계산 skip (시즌 생성 후 자동 재개)');
        warnedNoSeason = true;
      }
      return;
    }
    warnedNoSeason = false;

    const result = await rankingService.recomputeRankings(season.id);
    const accounts = result.individual.written + result.team.written;
    const skipped = result.individual.skipped + result.team.skipped;
    console.log(`[rankingScheduler] ${accounts} accounts (skipped ${skipped}) in ${Date.now() - startedAt}ms`);
  } catch (err) {
    // 에러가 나도 프로세스는 생존 — 다음 틱에서 회복 시도
    console.error(`[rankingScheduler] 재계산 실패 (${Date.now() - startedAt}ms): ${err.message}`);
  } finally {
    running = false;
  }
};

// held 태그 1분 동기화(docs/market-data-strategy.md §4 held) — isMarketOpen 가드 없음(장외에도
// 매수 반영 필요), tick()의 running과 완전 분리된 별도 가드. DB 조회에 성공했을 때만
// subscriptions.setHeld를 호출하므로, 실패 시 이 호출 자체가 안 일어나 held 태그가 직전 상태로
// 자동 유지된다(no-op 보장 — 빈 배열로 sync해서 전 보유종목 구독이 한 번에 해제되는 사고 방지).
const heldTick = async () => {
  if (heldRunning) return;
  heldRunning = true;
  const startedAt = Date.now();
  try {
    const season = await accountService.getActiveSeason();
    if (!season) {
      if (!warnedHeldNoSeason) {
        console.warn('[heldSync] 활성 시즌 없음 — 동기화 skip');
        warnedHeldNoSeason = true;
      }
      return;
    }
    warnedHeldNoSeason = false;

    const codes = await accountService.getHeldStockCodes(season.id);
    subscriptions.setHeld(codes);

    const { total, core = 0, held = 0, view = 0 } = subscriptions.stats();
    const credits = await redis.get(`credits:${getEtDateString()}`).catch(() => null);
    console.log(
      `[heldSync] ${codes.length} held codes, slots ${total}/500 (core ${core} held ${held} view ${view}), credits today ${credits ?? 0} (${Date.now() - startedAt}ms)`
    );
  } catch (err) {
    console.error(`[heldSync] 동기화 실패 (${Date.now() - startedAt}ms): ${err.message}`);
  } finally {
    heldRunning = false;
  }
};

// 일일 스냅샷 — ET 마감 5분 후 평일 1회, 최종 recompute → DailyRankings + AccountAssetHistories.
// 16:05엔 isMarketOpen()=false라 1분 틱과 겹치지 않고, 직전 틱 잔여분만 waitForIdle로 흡수.
// caveat: marketHours가 미국 공휴일 미반영 → 휴장일에도 fire되어 평탄한 스냅샷 1행 (허용, 공휴일 가드는 후속)
const snapshotTick = async () => {
  if (!(await waitForIdle())) {
    console.error('[dailySnapshot] 1분 틱이 5분째 미완료 — 스냅샷 중단 (다음 거래일에 재시도)');
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    const result = await rankingService.snapshotDailyRankings();
    if (!result) {
      console.warn('[dailySnapshot] 활성 시즌 없음 — 스냅샷 skip');
      return;
    }
    console.log(
      `[dailySnapshot] ${result.rank_date} — rankings ${result.rankings_written}행, assets ${result.assets_written}행 in ${Date.now() - startedAt}ms`
    );
  } catch (err) {
    console.error(`[dailySnapshot] 스냅샷 실패 (${Date.now() - startedAt}ms): ${err.message}`);
  } finally {
    running = false;
  }
};

const shouldStartRankingScheduler = (config) => !config.enabled;

const start = () => {
  if (!shouldStartRankingScheduler(getQaConfig()) || task) return; // QA preview는 세션별 고정 fixture만 사용
  task = cron.schedule('* * * * *', tick);
  heldTask = cron.schedule('* * * * *', heldTick); // tick과 동일 주기지만 완전히 별개의 cron.schedule 호출
  snapshotTask = cron.schedule('5 16 * * 1-5', snapshotTick, { timezone: 'America/New_York' });
  console.log('[rankingScheduler] 시작 — 장중 1분 재계산 + held 태그 1분 동기화 + 16:05 ET 일일 스냅샷');
};

// graceful shutdown 시 크론 정지 (진행 중인 틱은 자체 완료, 새 틱만 막음)
const stop = () => {
  if (task) {
    task.stop();
    task = null;
  }
  if (heldTask) {
    heldTask.stop();
    heldTask = null;
  }
  if (snapshotTask) {
    snapshotTask.stop();
    snapshotTask = null;
  }
};

module.exports = { shouldStartRankingScheduler, start, stop };
