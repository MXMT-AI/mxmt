import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  SHEETS_PRODUCT_FIELDS,
  SHEETS_ORDER_FIELDS,
} from "@/lib/sheets-mapping-contract";
import { input, mapping } from "../helpers/sheets-mapping";
import {
  compileSheetsProjection,
  sheetsOrderPolicy,
} from "@/lib/connectors/sheets-projection-compile";
import { normalizeOrder } from "@/lib/connectors/order-normalization";
import { parseOrderPolicy } from "@/lib/connectors/order-policy";
const row = (
  fields: readonly string[],
  values: Record<string, unknown>,
  rowNumber = 2,
) => ({
  rowNumber,
  data: Object.fromEntries(
    fields.map((field, i) => [
      `col_${String.fromCharCode(97 + i)}`,
      values[field] ?? null,
    ]),
  ),
});
const product = (values: Record<string, unknown> = {}, n = 2) =>
  row(
    SHEETS_PRODUCT_FIELDS,
    {
      productId: "p",
      sku: "sku",
      name: "Product",
      category: "Watches",
      quantity: 4,
      retailPrice: 20,
      costPrice: 4,
      ...values,
    },
    n,
  );
const order = (values: Record<string, unknown> = {}, n = 2) =>
  row(
    SHEETS_ORDER_FIELDS,
    {
      orderId: "o",
      lineId: "l",
      productId: "p",
      sku: "sku",
      statusId: 5,
      channelId: 1,
      quantity: 3,
      salesAmount: "10.0001",
      costAmount: "4.0001",
      paidAt: "2026-10-20",
      ...values,
    },
    n,
  );
it("preserves net line amounts as exact source evidence, including signed returns", () => {
  const m = mapping(),
    p = sheetsOrderPolicy(m);
  expect(parseOrderPolicy(p)).toEqual(p);
  const compiled = compileSheetsProjection(input, m, {
    products: [product()],
    orders: [order({ statusId: 7, returnedAt: "2026-10-21" })],
  });
  const normalized = normalizeOrder(compiled.orders[0], input.timezone, p)
    .lines[0];
  expect(normalized.signedRevenue?.toString()).toBe("-10.0001");
  expect(normalized.signedCost?.toString()).toBe("-4.0001");
  expect(normalized.signedQuantity?.toString()).toBe("-3");
  expect(normalized.sourceAmounts.unitPrice).toBeNull();
});
it("requires an approved line basis rather than silently interpreting a unit price as a line total", () => {
  const m = mapping(),
    compiled = compileSheetsProjection(input, m, {
      products: [product()],
      orders: [order()],
    });
  const normalized = normalizeOrder(compiled.orders[0], input.timezone, {
    ...sheetsOrderPolicy(m),
    amounts: { price: "net_unit", absoluteDiscount: "line", currency: "UAH" },
  }).lines[0];
  expect(normalized.netAmount).toBeNull();
  expect(normalized.signedRevenue).toBeNull();
});
it("supports independently mapped unit sales and line costs without confusing their bases", () => {
  const m = mapping();
  m.policy.salesAmount = "net_unit";
  const compiled = compileSheetsProjection(input, m, {
    products: [product()],
    orders: [order({ salesAmount: "1.25" })],
  });
  const line = normalizeOrder(
    compiled.orders[0],
    input.timezone,
    sheetsOrderPolicy(m),
  ).lines[0];
  expect(line.netAmount?.toString()).toBe("3.75");
  expect(line.costAmount?.toString()).toBe("4.0001");
});
it("quarantines amounts that would need silent Decimal rounding", () => {
  const m = mapping();
  m.policy.salesAmount = "net_unit";
  const result = compileSheetsProjection(input, m, {
    products: [product()],
    orders: [order({ quantity: "0.0001", salesAmount: "0.0001" })],
  });
  expect(result.orders).toHaveLength(0);
  expect(result.stats.quarantined).toBe(1);
});
it("does not fall back to generic timestamps for return dates or fabricate coverage", () => {
  const m = mapping();
  const compiled = compileSheetsProjection(input, m, {
    products: [product()],
    orders: [
      order({ statusId: 7, updatedAt: "2026-10-21", orderedAt: "2026-10-20" }),
    ],
  });
  const line = normalizeOrder(
    compiled.orders[0],
    input.timezone,
    sheetsOrderPolicy(m),
  ).lines[0];
  expect(line.returnedAt).toBeNull();
  expect(line.signedRevenue).toBeNull();
  expect(compiled.stockProductIds).toEqual([]);
});
it("matches duplicate SKUs only through unambiguous product IDs and quarantines SKU-only ambiguity", () => {
  const compiled = compileSheetsProjection(input, mapping(), {
    products: [product(), product({ productId: "p2" }, 3)],
    orders: [order(), order({ orderId: "o2", productId: null }, 3)],
  });
  expect(compiled.catalog.products.map((p) => p.sku)).toEqual([null, null]);
  expect(compiled.orders).toHaveLength(1);
  expect(compiled.orders[0].lines[0].productId).toBe("p");
  expect(compiled.stats.quarantined).toBe(1);
});
it("rejects conflicting order-header facts atomically rather than mixing event dates", () => {
  const compiled = compileSheetsProjection(input, mapping(), {
    products: [product()],
    orders: [order(), order({ lineId: "other", paidAt: "2026-10-22" }, 3)],
  });
  expect(compiled.orders).toHaveLength(0);
  expect(compiled.stats.quarantinedRows).toBe(2);
});
it("keeps missing and future stock timestamps unavailable", () => {
  const m = mapping();
  m.policy.stockObservation = "column";
  const compiled = compileSheetsProjection(input, m, {
    products: [product({ observedAt: "2099-01-01" })],
    orders: [],
  });
  expect(compiled.stockProductIds).toEqual([]);
  expect(compiled.issues).toContain("STOCK_OBSERVATION_UNVERIFIED");
});
