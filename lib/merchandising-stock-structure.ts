import { financialDecimal as D } from "./merchandising-policy";
export const STOCK_RING_STATUSES = ["DEAD", "RISK", "HEALTHY"] as const;
type StatusCost = {
  status: string;
  stockCost: string | null;
  coveredStockCost: string;
  skuCount: number;
  physicalSkuCount: number;
  missingCostSkuCount: number;
};
/** Monetary percentages always declare their population; unknown costs never become zero. */
export function stockStructure(rows: StatusCost[]) {
  const physical = rows.filter(
    (r) =>
      r.physicalSkuCount > 0 ||
      (r.status === "DATA_ERROR" && r.skuCount > r.physicalSkuCount),
  );
  const ring = physical.filter((r) =>
    STOCK_RING_STATUSES.includes(r.status as never),
  );
  const sum = (items: StatusCost[]) =>
    items.reduce((a, r) => a.add(r.coveredStockCost), D(0));
  const complete = (items: StatusCost[]) =>
    items.every(
      (r) =>
        r.stockCost !== null &&
        !r.missingCostSkuCount &&
        !(r.status === "DATA_ERROR" && r.skuCount > r.physicalSkuCount),
    );
  const full = sum(physical),
    eligible = sum(ring),
    fullComplete = complete(physical),
    ringComplete = complete(ring);
  return {
    stockCost: fullComplete ? full.toString() : null,
    coveredStockCost: full.toString(),
    ringCost: ringComplete ? eligible.toString() : null,
    coveredRingCost: eligible.toString(),
    ringSkuCount: ring.reduce((n, r) => n + r.skuCount, 0),
    grayCost: complete(
      physical.filter((r) => r.status === "NEW" || r.status === "OFF_SEASON"),
    )
      ? sum(
          physical.filter(
            (r) => r.status === "NEW" || r.status === "OFF_SEASON",
          ),
        ).toString()
      : null,
    shares: Object.fromEntries(
      rows.map((r) => [
        r.status,
        {
          all:
            fullComplete && full.gt(0) && r.stockCost !== null
              ? D(r.stockCost).div(full).toString()
              : null,
          ring:
            ringComplete &&
            eligible.gt(0) &&
            r.stockCost !== null &&
            STOCK_RING_STATUSES.includes(r.status as never)
              ? D(r.stockCost).div(eligible).toString()
              : null,
        },
      ]),
    ),
  };
}
