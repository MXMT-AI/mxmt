import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  csvCell,
  csvDocument,
  repricingCsv,
  reorderingCsv,
  REPRICE_CSV_HEADERS,
  REORDER_CSV_HEADERS,
} from "@/lib/scenario-csv";
import { calculateRepricing, parseRepricingRequest } from "@/lib/repricing";
import {
  calculateReordering,
  parseReorderingRequest,
} from "@/lib/reorder-calc";
import type { RepriceResult, ReorderResult } from "@/lib/scenario-csv";
import { repricingUiSkus } from "../helpers/repricing-workspace";
import { reorderingUiSkus } from "../helpers/reordering-workspace";
const id = "11111111-1111-4111-8111-111111111111";
describe("CSV wire format and formula protection", () => {
  it("emits BOM, semicolon columns, CRLF records and escaped localized multiline text", () => {
    const csv = csvDocument(
      ["sku", "name"],
      [
        [
          { type: "text", value: "001" },
          { type: "text", value: 'Годинник; «Київ» "Ліміт"\r\nновий' },
        ],
      ],
    );
    expect(Buffer.from(csv).subarray(0, 3)).toEqual(
      Buffer.from([239, 187, 191]),
    );
    expect(csv).toBe(
      '\uFEFF"sku";"name"\r\n"001";"Годинник; «Київ» ""Ліміт""\r\nновий"\r\n',
    );
  });
  it.each([
    "=1+2",
    "+SUM(A1)",
    "-2+3",
    "@SUM(A1)",
    " \t=HYPERLINK(1)",
    "\nnormal",
    "\r=1",
    "\tname",
    "\uFEFF=1",
    "\u200B=1",
    "＝1",
    "＋1",
    "－1",
    "＠1",
  ])("neutralizes text initiator %j", (value) =>
    expect(csvCell({ type: "text", value }).startsWith("\"'")).toBe(true),
  );
  it("retains trusted negative decimal discounts while rejecting formula/non-finite numeric cells", () => {
    expect(csvCell({ type: "decimal", value: "-0.25" })).toBe('"-0.25"');
    for (const value of ["=1", "NaN", "Infinity", "1e3", "1;2"])
      expect(() => csvCell({ type: "decimal", value })).toThrow(
        "INVALID_EXPORT_DECIMAL",
      );
  });
  it("does not allow separator/quote injection to create an extra column", () =>
    expect(csvCell({ type: "text", value: 'safe";=CMD()' })).toBe(
      '"safe"";=CMD()"',
    ));
  it("exports only valid final repricing rows using the approved schema and actual discount", () => {
    const result = calculateRepricing(
      {
        id: "inputs",
        snapshotId: "snapshot",
        asOf: "2026-10-25",
        rows: repricingUiSkus,
      },
      parseRepricingRequest({ inputSetId: "inputs" }),
    ) as RepriceResult;
    const built = repricingCsv(result, id);
    expect(built.files[0].rowCount).toBe(result.counts.selectedSkuCount);
    expect(built.rows.every((row) => row.ownership === "OWN")).toBe(true);
    expect(built.files[0].content.split("\r\n")[0]).toBe(
      "\uFEFF" + REPRICE_CSV_HEADERS.map((h) => '"' + h + '"').join(";"),
    );
    expect(built.totals).toEqual(result.totals);
  });
  it("requires readiness per explicit supplier/currency scope and excludes seasonal/zero rows", () => {
    const result = calculateReordering(
      { snapshotId: "snapshot", asOf: "2026-10-25", rows: reorderingUiSkus },
      parseReorderingRequest({ snapshotId: "snapshot" }),
    ) as ReorderResult;
    expect(() => reorderingCsv(result, id)).toThrow("EXPORT_NOT_READY");
    const built = reorderingCsv(result, id, {
      supplierId: "supplier-b",
      currency: "USD",
    });
    expect(built.files).toHaveLength(1);
    expect(built.files[0]).toMatchObject({
      supplierId: "supplier-b",
      currency: "USD",
      rowCount: 1,
    });
    expect(built.files[0].content.split("\r\n")[0]).toBe(
      "\uFEFF" + REORDER_CSV_HEADERS.map((h) => '"' + h + '"').join(";"),
    );
    expect(
      built.rows.every((r) => r.skuId !== "sku-03" && r.quantity !== "0"),
    ).toBe(true);
  });
});

it("rejects an oversized UTF-8 download before publishing an export", () => {
  expect(() =>
    csvDocument(
      ["name"],
      [[{ type: "text", value: "я".repeat(2 * 1024 * 1024) }]],
    ),
  ).toThrow("EXPORT_SIZE_LIMIT");
});
