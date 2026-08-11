// 태그 기반 WS 구독 슬롯 레지스트리 (docs/market-data-strategy.md §3).
// 실제 Twelve Data WS 호출은 하지 않는다 — init()으로 주입받은 onSubscribe/onUnsubscribe
// (둘 다 string[] 배치 콜백)를 통해서만 바깥에 알린다. wsUpstream/wsGateway를 이 파일이
// require하지 않는 것이 순환참조 방지 + 유닛테스트 용이성의 핵심.
//
// 태그 3종: core(정적 설정) / held(보유종목, DB 스냅샷 동기화) / view:{socketId}(상세페이지 조회).
// 태그가 하나라도 남아있으면 구독 유지, 0개가 되면 유예(GRACE_MS) 후 실제 unsubscribe.
// 유예 로직은 태그 종류와 무관하게 "해제 판정" 한 곳에만 있다(§3-3).

const { parseEnvInt } = require('../config/env');

// 5분 기본값은 임의값이 아니다 — docs/market-data-strategy.md §3-3/§4의 held 정책이
// "view 유예(5분) > held 동기화 주기(1분)"라는 부등식에 구조적으로 의존한다(매수 직후 공백 방지).
// 이 값을 5분보다 짧게 내리면 해당 보장이 깨진다.
const DEFAULT_GRACE_MS = 5 * 60_000;
const GRACE_MS = parseEnvInt('WS_UNSUBSCRIBE_GRACE_MS', DEFAULT_GRACE_MS);

const tagsBySymbol = new Map(); // symbol -> Set<tag>
const graceTimers = new Map(); // symbol -> Timeout (불변식: 타이머 존재 ⇔ tags.size === 0으로 유예 중)

const pendingSubscribe = new Set();
const pendingUnsubscribe = new Set();
let flushScheduled = false;

let onSubscribe = () => {};
let onUnsubscribe = () => {};

const normalize = (symbol) => String(symbol || '').trim().toUpperCase();

// 같은 틱 내 여러 add/remove를 한 번의 subscribe/unsubscribe 액션으로 배치(§7-1③)
const flush = () => {
  flushScheduled = false;

  // 해제 유예 타이머가 발화해서 pendingUnsubscribe에 들어간 뒤, 이 flush가 실제로 돌기 전에
  // 같은 심볼이 add()로 다시 태그를 얻는 경우가 있다(그 사이 유예 타이머 콜백은 이미 스스로를
  // graceTimers에서 지운 뒤라 add()가 취소할 대상이 없음 — subscriptions.js:remove 참고).
  // 이때 pendingUnsubscribe에 남아있는 걸 그대로 보내면 실제 업스트림은 해제되는데 내부 태그
  // 상태(tagsBySymbol)는 여전히 "구독 중"으로 남는 불일치가 생긴다. flush 직전에 현재 태그
  // 상태로 한 번 더 재확인해서 이미 재구독된 심볼은 해제 목록에서 뺀다.
  pendingUnsubscribe.forEach((sym) => {
    if (tagsBySymbol.has(sym)) pendingUnsubscribe.delete(sym);
  });

  if (pendingSubscribe.size) {
    const batch = [...pendingSubscribe];
    pendingSubscribe.clear();
    onSubscribe(batch);
  }
  if (pendingUnsubscribe.size) {
    const batch = [...pendingUnsubscribe];
    pendingUnsubscribe.clear();
    onUnsubscribe(batch);
  }
};

const scheduleFlush = () => {
  if (flushScheduled) return;
  flushScheduled = true;
  setImmediate(flush);
};

const init = ({ core = [], onSubscribe: subFn, onUnsubscribe: unsubFn } = {}) => {
  onSubscribe = subFn || (() => {});
  onUnsubscribe = unsubFn || (() => {});
  core.forEach((symbol) => add(symbol, 'core'));
};

const add = (symbol, tag) => {
  const sym = normalize(symbol);
  if (!sym) return;

  const timer = graceTimers.get(sym);
  if (timer) {
    clearTimeout(timer);
    graceTimers.delete(sym); // 유예 중 재추가 → 해제 취소
  }

  let tags = tagsBySymbol.get(sym);
  const wasEmpty = !tags || tags.size === 0;
  if (!tags) {
    tags = new Set();
    tagsBySymbol.set(sym, tags);
  }
  tags.add(tag);

  if (wasEmpty) {
    pendingSubscribe.add(sym);
    scheduleFlush();
  }
};

const remove = (symbol, tag) => {
  const sym = normalize(symbol);
  const tags = tagsBySymbol.get(sym);
  if (!tags || !tags.has(tag)) return;

  tags.delete(tag);
  if (tags.size > 0) return; // 다른 태그가 남아있으면 유지

  const timer = setTimeout(() => {
    graceTimers.delete(sym);
    const current = tagsBySymbol.get(sym);
    if (current && current.size === 0) {
      // 유예 중 재추가 안 됐는지 재확인
      tagsBySymbol.delete(sym);
      pendingUnsubscribe.add(sym);
      scheduleFlush();
    }
  }, GRACE_MS);
  timer.unref?.();
  graceTimers.set(sym, timer);
};

// held 전량 스냅샷 교체 — rankingScheduler의 1분 동기화가 사용. DB 조회에 성공했을 때만 호출할 것
// (호출 자체를 안 하면 held 태그가 직전 상태로 자동 유지되는 것이 no-op 보장의 핵심).
const setHeld = (symbols) => {
  const next = new Set(symbols.map(normalize).filter(Boolean));
  const current = [];
  tagsBySymbol.forEach((tags, sym) => {
    if (tags.has('held')) current.push(sym);
  });
  current.forEach((sym) => {
    if (!next.has(sym)) remove(sym, 'held');
  });
  next.forEach((sym) => add(sym, 'held'));
};

const list = () => [...tagsBySymbol.keys()];
const hasTag = (symbol, tag) => !!tagsBySymbol.get(normalize(symbol))?.has(tag);
const tagsOf = (symbol) => [...(tagsBySymbol.get(normalize(symbol)) || [])];

const stats = () => {
  const counts = { core: 0, held: 0, view: 0 };
  tagsBySymbol.forEach((tags) => {
    tags.forEach((tag) => {
      const key = tag.startsWith('view:') ? 'view' : tag;
      counts[key] = (counts[key] || 0) + 1;
    });
  });
  return { total: tagsBySymbol.size, ...counts };
};

// 테스트/재시작용 — graceTimers까지 확실히 정리
const reset = () => {
  graceTimers.forEach((t) => clearTimeout(t));
  graceTimers.clear();
  tagsBySymbol.clear();
  pendingSubscribe.clear();
  pendingUnsubscribe.clear();
  flushScheduled = false;
  onSubscribe = () => {};
  onUnsubscribe = () => {};
};

module.exports = { init, add, remove, setHeld, list, hasTag, tagsOf, stats, reset, GRACE_MS };
