import "server-only";
import { createHash } from "node:crypto";
import { financialDecimal as D } from "./financial-decimal.mjs";
import type { calculateRepricingInSnapshot } from "./repricing-store";
import type { calculateReorderingInSnapshot } from "./reordering-store";
export class ScenarioExportError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
    this.name = "ScenarioExportError";
  }
}
export const REPRICE_CSV_HEADERS = [
  "sku",
  "barcode",
  "brand",
  "category",
  "name",
  "old_price",
  "new_price",
  "discount_pct",
  "promo_days",
  "reason",
] as const;
export const REORDER_CSV_HEADERS = [
  "supplier",
  "sku",
  "barcode",
  "name",
  "qty",
  "unit_cost",
  "sum",
] as const;
export interface CsvFile {
  id: string;
  name: string;
  content: string;
  sha256: string;
  byteLength: number;
  rowCount: number;
  supplierId: string | null;
  currency: string;
}
export type RepriceResult = Awaited<
  ReturnType<typeof calculateRepricingInSnapshot>
>;
export type ReorderResult = Awaited<
  ReturnType<typeof calculateReorderingInSnapshot>
>;
type Cell = { type: "text" | "decimal"; value: string };
const text = (v: string | null): Cell => ({ type: "text", value: v ?? "" });
const decimal = (v: string | number): Cell => ({
  type: "decimal",
  value: D(v).toFixed(),
});
export function csvCell(cell: Cell) {
  let value = cell.value;
  if (cell.type === "decimal") {
    if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value))
      throw new ScenarioExportError("INVALID_EXPORT_DECIMAL", 422);
  } else if (
    /^[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]*[=+\-@＝＋－＠]/u.test(
      value,
    ) ||
    /^[\t\r\n]/.test(value)
  )
    value = "'" + value;
  return '"' + value.replaceAll('"', '""') + '"';
}
export function csvDocument(headers: readonly string[], rows: Cell[][]) {
  const content =
    "\uFEFF" +
    [
      headers.map((v) => csvCell(text(v))).join(";"),
      ...rows.map((row) => {
        if (row.length !== headers.length)
          throw new ScenarioExportError("INVALID_EXPORT_COLUMNS", 422);
        return row.map(csvCell).join(";");
      }),
    ].join("\r\n") +
    "\r\n";
  if (Buffer.byteLength(content, "utf8") > 4 * 1024 * 1024)
    throw new ScenarioExportError("EXPORT_SIZE_LIMIT", 422);
  return content;
}
const hash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
function file(
  name: string,
  content: string,
  rowCount: number,
  supplierId: string | null,
  currency: string,
): CsvFile {
  return {
    id: hash(name).slice(0, 24),
    name,
    content,
    sha256: hash(content),
    byteLength: Buffer.byteLength(content, "utf8"),
    rowCount,
    supplierId,
    currency,
  };
}
export function repricingCsv(result: RepriceResult, exportId: string) {
  if (!result.canExport) throw new ScenarioExportError("EXPORT_NOT_READY", 422);
  const rows = result.rows.filter((r) => r.selected);
  const content = csvDocument(
    REPRICE_CSV_HEADERS,
    rows.map((r) => [
      text(r.sku),
      text(r.barcode),
      text(r.brandName),
      text(r.categoryName),
      text(r.name),
      decimal(r.currentPrice!),
      decimal(r.newPrice!),
      decimal(D(r.effectiveDiscount!).mul(100).toFixed()),
      decimal(result.parameters.durationDays),
      text(
        [
          result.parameters.goal,
          r.classification,
          r.manualPrice ? "MANUAL_PRICE" : null,
          r.floorLimited ? "COST_FLOOR" : null,
          result.parameters.liquidation
            ? `LIQUIDATION: ${result.parameters.liquidationReason}`
            : null,
        ]
          .filter(Boolean)
          .join("; "),
      ),
    ]),
  );
  return {
    files: [
      file(`repricing-${exportId}.csv`, content, rows.length, null, "UAH"),
    ],
    rows: rows.map((r) => ({
      skuId: r.skuId,
      sku: r.sku,
      barcode: r.barcode,
      brandId: r.brandId,
      brand: r.brandName,
      categoryId: r.categoryId,
      category: r.categoryName,
      name: r.name,
      quantity: r.quantity,
      unitCost: r.unitCost,
      oldPrice: r.currentPrice,
      newPrice: r.newPrice,
      effectiveDiscount: r.effectiveDiscount,
      manualPrice: r.manualPrice,
      ownership: r.ownership,
      currency: r.currency,
    })),
    totals: result.totals,
  };
}
export function reorderingCsv(
  result: ReorderResult,
  exportId: string,
  target?: { supplierId: string; currency: string },
) {
  const scope = result.rows.filter(
    (r) =>
      !target ||
      (r.policy.supplierId === target.supplierId &&
        r.currency === target.currency),
  );
  if (
    !scope.length ||
    !scope.some((r) => r.exportEligible) ||
    scope.some(
      (r) =>
        r.recommendedQuantity === null ||
        (D(r.recommendedQuantity).gt(0) && !r.exportEligible),
    )
  )
    throw new ScenarioExportError("EXPORT_NOT_READY", 422);
  const chosen = scope.filter(
      (r) => r.exportEligible && D(r.recommendedQuantity!).gt(0),
    ),
    groups = new Map<string, typeof chosen>();
  for (const row of chosen) {
    const key = JSON.stringify([row.policy.supplierId, row.currency]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const files = [...groups]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, rows]) => {
      const first = rows[0],
        name = `reorder-${hash(first.policy.supplierId!).slice(0, 12)}-${first.currency}-${exportId}.csv`;
      const content = csvDocument(
        REORDER_CSV_HEADERS,
        rows.map((r) => [
          text(r.supplierName),
          text(r.sku),
          text(r.barcode),
          text(r.name),
          decimal(r.recommendedQuantity!),
          decimal(r.unitCost!),
          decimal(r.purchaseAmount!),
        ]),
      );
      return file(
        name,
        content,
        rows.length,
        first.policy.supplierId,
        first.currency!,
      );
    });
  return {
    files,
    rows: chosen.map((r) => ({
      skuId: r.skuId,
      sku: r.sku,
      barcode: r.barcode,
      name: r.name,
      supplierId: r.policy.supplierId,
      supplier: r.supplierName,
      currency: r.currency,
      stock: r.quantity,
      velocityPerWeek: r.velocityPerWeek,
      denominatorWeeks: r.denominatorWeeks,
      inTransitQuantity: r.inTransitQuantity,
      inTransitSource: r.inTransitSource,
      leadDays: r.leadDays,
      coverDays: r.coverDays,
      moq: r.moq,
      quantity: r.recommendedQuantity,
      unitCost: r.unitCost,
      purchaseAmount: r.purchaseAmount,
    })),
    totals: result.suppliers.filter(
      (s) =>
        !target ||
        (s.supplierId === target.supplierId && s.currency === target.currency),
    ),
  };
}
