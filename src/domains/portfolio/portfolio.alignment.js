// 전략 준수도(Alignment) 계산 — 순수 계산 로직 (의존성 0, 단위테스트 가능)
//
// 명세서 공식:
//   TotalValue      = Σ(종가 × 수량) + Cash
//   CurrentWeight_i = (종가 × 수량) / TotalValue × 100
//   CurrentWeight_CASH = Cash / TotalValue × 100
//   Tolerance_i     = TargetWeight_i × 0.02   (허용 오차 2%)
//   RawDiff_i       = |CurrentWeight_i - TargetWeight_i|
//   Diff_i          = 0                  if RawDiff ≤ Tolerance
//                   = RawDiff - Tolerance  if 초과
//   TotalDiff       = Σ Diff_i            (목표 외 종목은 Target 0%로 계산)
//   Alignment       = 100 × (1 - TotalDiff / 200)  → 0~100 클램프

const round = (v, d = 2) => {
  const s = 10 ** d;
  return Math.round(v * s) / s;
};

/**
 * @param {Array<{stock_code: string, target_percentage: number}>} allocations - 목표 비중
 * @param {Array<{stock_code: string, quantity: number, current_price: number}>} holdings - 보유종목 + 현재가
 * @param {number} cashBalance - 현금 잔액
 * @returns {{ alignment: number, totalDiff: number, items: Array }}
 */
const calculateAlignment = ({ allocations, holdings, cashBalance }) => {
  const holdingMap = new Map();
  for (const h of holdings) {
    holdingMap.set(h.stock_code, {
      quantity: Number(h.quantity),
      current_price: Number(h.current_price),
      value: Number(h.quantity) * Number(h.current_price),
    });
  }

  const totalValue =
    Number(cashBalance) + [...holdingMap.values()].reduce((sum, h) => sum + h.value, 0);

  if (totalValue <= 0) {
    return { alignment: 100, totalDiff: 0, items: [] };
  }

  // 목표 비중에 있는 종목 집합
  const targetCodes = new Set(allocations.map((a) => a.stock_code));

  const items = [];
  let totalDiff = 0;

  // 1) 목표 비중에 있는 종목
  for (const alloc of allocations) {
    const target = Number(alloc.target_percentage);
    const holding = holdingMap.get(alloc.stock_code);
    const currentWeight = holding ? round((holding.value / totalValue) * 100, 2) : 0;
    const tolerance = round(target * 0.02, 4);
    const rawDiff = round(Math.abs(currentWeight - target), 2);
    const diff = rawDiff <= tolerance ? 0 : round(rawDiff - tolerance, 2);
    totalDiff += diff;

    let status = 'NORMAL'; // 정상
    if (rawDiff > target * 0.1) status = 'WARNING'; // 경고: 10% 초과 괴리
    else if (rawDiff > target * 0.05) status = 'CAUTION'; // 주의: 5% 초과 괴리

    items.push({
      stock_code: alloc.stock_code,
      target_weight: target,
      current_weight: currentWeight,
      diff: round(currentWeight - target, 2),
      raw_diff: rawDiff,
      status,
    });
  }

  // 2) 목표에 없지만 보유 중인 종목 (Target 0%로 계산)
  for (const [code, holding] of holdingMap) {
    if (targetCodes.has(code)) continue;
    const currentWeight = round((holding.value / totalValue) * 100, 2);
    totalDiff += currentWeight; // target=0, tolerance=0 → diff = currentWeight
    items.push({
      stock_code: code,
      target_weight: 0,
      current_weight: currentWeight,
      diff: currentWeight,
      raw_diff: currentWeight,
      status: currentWeight > 0 ? 'WARNING' : 'NORMAL',
    });
  }

  totalDiff = round(totalDiff, 2);
  const alignment = Math.max(0, Math.min(100, round(100 * (1 - totalDiff / 200), 1)));

  return { alignment, totalDiff, items };
};

module.exports = { calculateAlignment };
