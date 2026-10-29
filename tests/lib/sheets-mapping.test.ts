import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  parseSheetsMapping,
  createMappingAnalyzer,
  validateMappingColumns,
  suggestSheetsMapping,
} from "@/lib/connectors/sheets-mapping-validation";
import {
  SHEETS_PRODUCT_FIELDS,
  SHEETS_ORDER_FIELDS,
  type SheetsFieldMapping,
  type SheetsMappingInput,
} from "@/lib/sheets-mapping-contract";
import { input, mapping } from "../helpers/sheets-mapping";
const row = (
  fields: readonly string[],
  values: Record<string, unknown>,
  rowNumber = 2,
) => ({
  rowNumber,
  data: Object.fromEntries(
    fields.map((f, i) => [
      `col_${String.fromCharCode(97 + i)}`,
      values[f] ?? null,
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
      quantity: 1,
      retailPrice: 20,
      costPrice: 10,
      inTransit: 0,
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
      quantity: 1,
      salesAmount: 20,
      costAmount: 10,
      paidAt: "2026-10-20",
      ...values,
    },
    n,
  );
it("requires explicit currency, field mappings and actual event dates, rejecting extra fields", () => {
  expect(parseSheetsMapping(mapping())).toEqual(mapping());
  for (const value of [
    { ...mapping(), endpoint: "https://evil.invalid" },
    { ...mapping(), policy: { ...mapping().policy, currency: "" } },
    { ...mapping(), orders: { ...mapping().orders, returnedAt: null } },
    {
      ...mapping(),
      policy: { ...mapping().policy, salesAmount: "gross_line" },
    },
  ])
    expect(() => parseSheetsMapping(value)).toThrow();
});
it("validates chosen columns against the actual frozen snapshot", () => {
  expect(() => validateMappingColumns(mapping(), input)).not.toThrow();
  expect(() =>
    validateMappingColumns(
      {
        ...mapping(),
        products: { ...mapping().products, productId: "col_zz" },
      },
      input,
    ),
  ).toThrow("SHEETS_MAPPING_COLUMN_NOT_FOUND");
});
it("never proposes approved statuses, currency, ownership or stock history from header names", () => {
  const p = suggestSheetsMapping(input);
  expect(p.policy).toMatchObject({
    statuses: {},
    currency: "",
    defaultProductKind: "UNKNOWN",
    stockObservation: "unverified",
  });
  expect(p.orders.returnedAt).toBeNull();
});
it("accepts exact scalar Decimals but rejects invalid dates and never falls back to order/update timestamps", () => {
  const a = createMappingAnalyzer(mapping(), "Europe/Kyiv");
  a.products([product()]);
  a.orders([
    order({
      paidAt: "not-a-date",
      orderedAt: "2026-10-20",
      updatedAt: "2026-10-20",
    }),
  ]);
  const s = a.finish();
  expect(s.invalidRows.orders).toBe(1);
  expect(s.problems).toContainEqual(
    expect.objectContaining({ code: "SALE_DATE_UNVERIFIED" }),
  );
});
it("reports unmatched/conflicting/ambiguous identities and duplicate source rows without guessing", () => {
  const a = createMappingAnalyzer(mapping(), "Europe/Kyiv");
  a.products([
    product(),
    product({ productId: "q", sku: "sku-2" }, 3),
    product({}, 4),
  ]);
  a.orders([
    order({ productId: "q" }),
    order({}, 3),
    order({}, 4),
    order({ productId: "unknown" }, 5),
  ]);
  const s = a.finish();
  expect(s.blockingErrors).toContain("DUPLICATE_PRODUCT_IDENTITIES");
  expect(s.duplicateOrderLines).toBeGreaterThan(0);
  expect(s.problems).toContainEqual(
    expect.objectContaining({ code: "ORDER_PRODUCT_IDENTITY_CONFLICT" }),
  );
  expect(s.problems).toContainEqual(
    expect.objectContaining({ code: "ORDER_PRODUCT_UNMATCHED" }),
  );
});
it("marks unapproved statuses/product kinds and stock/in-transit/coverage as unavailable, not zero", () => {
  const m = mapping();
  m.products.inTransit = null;
  m.policy.productKinds = {};
  const a = createMappingAnalyzer(m, "Europe/Kyiv");
  a.products([product()]);
  a.orders([order({ statusId: 999 })]);
  const s = a.finish();
  expect(s.unmappedStatuses).toBe(1);
  expect(s.unverifiedProductKinds).toBe(1);
  expect(s.warnings).toEqual(
    expect.arrayContaining([
      "IN_TRANSIT_UNKNOWN",
      "HISTORY_COVERAGE_NOT_CONFIRMED",
      "STOCK_OBSERVATION_UNVERIFIED",
    ]),
  );
});
it("does not resolve inherited prototype properties as approved business classifications", () => {
  const a = createMappingAnalyzer(mapping(), "Europe/Kyiv");
  a.products([product({ category: "constructor" })]);
  a.orders([order({ statusId: "toString" })]);
  const s = a.finish();
  expect(s.unverifiedProductKinds).toBe(1);
  expect(s.unmappedStatuses).toBe(1);
  expect(Object.keys(s.statusCounts)).toEqual([]);
});
it("bounds issue samples and keeps exact totals beyond the displayed sample", () => {
  const a = createMappingAnalyzer(mapping(), "Europe/Kyiv");
  a.products([product()]);
  a.orders(
    Array.from({ length: 200 }, (_, i) =>
      order({ lineId: `l${i}`, paidAt: "invalid" }, i + 2),
    ),
  );
  const s = a.finish();
  expect(s.problemCount).toBe(200);
  expect(s.problems).toHaveLength(100);
  expect(s.invalidRows.orders).toBe(200);
});

it("blocks approval when an observed dictionary exceeds the bounded mapping contract", () => {
  const a = createMappingAnalyzer(mapping(), "Europe/Kyiv");
  a.products([product()]);
  a.orders(
    Array.from({ length: 101 }, (_, i) =>
      order({ statusId: i, lineId: `line-${i}` }, i + 2),
    ),
  );
  const summary = a.finish();
  expect(Object.keys(summary.statusCounts)).toHaveLength(100);
  expect(summary.blockingErrors).toContain("MAPPING_DICTIONARY_LIMIT");
});
