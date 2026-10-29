import { it, expect, vi } from "vitest";
import * as XLSX from "xlsx";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { readFile, stat } from "node:fs/promises";
import { parseRawWorkbook } from "@/lib/data-import-workbook";
import { suggestSheetsMapping } from "@/lib/connectors/sheets-mapping-validation";
import {
  compileSheetsProjection,
  sheetsOrderPolicy,
} from "@/lib/connectors/sheets-projection-compile";
import { normalizeOrder } from "@/lib/connectors/order-normalization";
import { SalesDriveConnector } from "@/lib/connectors/salesdrive";
import type { SheetsMappingInput } from "@/lib/sheets-mapping-contract";
import { inspectSheetsOffline } from "@/lib/sheets-offline-acceptance";
import { savePrivate } from "@/lib/reconciliation-files.mjs";
const instant = "2026-10-29T12:00:00.000Z";
function fixture(name = "Private fixture name") {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["ID", "Name", "Price", "Vendor Price", "Stock Qty", "Article", "Category"],
      ["p", name, 10, 4, 3, "sku", "Private fixture category"],
    ]),
    "Product YML 2.0",
  );
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      [
        "id",
        "orderId",
        "paymentDate",
        "statusId",
        "product.amount",
        "product.sku",
        "product.productId",
        "ProductPaymentAmount",
        "ProductcostPriceAmount",
      ],
      [1, "private-order", "2026-10-20", 5, 3, "sku", "p", 10, 4],
    ]),
    "ZAVOD_API",
  );
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
it("diagnoses a real workbook shape without approving statuses, currency or financial output", () => {
  const result = inspectSheetsOffline(fixture(), instant);
  expect(result).toMatchObject({
    status: "REVIEW_REQUIRED",
    activated: false,
    liveSalesDriveVerified: false,
    financialRows: 0,
    structural: { products: 1, orders: 1, orderLines: 1 },
  });
  expect(result.issues.unmappedStatuses).toBe(1);
  expect(JSON.stringify(result)).not.toMatch(
    /Private fixture name|private-order|Private fixture category/,
  );
  expect(result.unapproved).toContain("STATUS_MEANINGS");
});
const path = process.env.MXMT_OFFLINE_WORKBOOK;
it.skipIf(!path)(
  "inspects a user-supplied private workbook offline and saves aggregate evidence outside the repository",
  async () => {
    expect((await stat(path!)).size).toBeLessThanOrEqual(15 * 1024 * 1024);
    const result = inspectSheetsOffline(
      await readFile(path!),
      new Date().toISOString(),
    );
    expect(result.financialRows).toBe(0);
    expect(result.activated).toBe(false);
    await savePrivate(
      process.env.MXMT_OFFLINE_REPORT ??
        "/tmp/mxmt-reporting-offline-evidence.json",
      result,
    );
  },
  60000,
);

it("normalizes equivalent synthetic Sheets line totals and SalesDrive unit amounts into identical financial facts", async () => {
  const parsed = parseRawWorkbook(fixture()),
    sheets = parsed.sheets.filter(
      (s) => s.key === "product_yml" || s.key === "zavod_api",
    );
  const input: SheetsMappingInput = {
    sourceId: "offline",
    fileId: "offline",
    importRunId: "offline",
    timezone: "Europe/Kyiv",
    importedAt: instant,
    sourceChecksum: "synthetic",
    sheets: sheets.map((s) => ({
      id: s.key,
      sheetKey: s.key,
      sourceName: s.sourceName,
      columns: s.columns,
      rowCount: s.rows.length,
      checksum: s.checksum,
    })),
  };
  const m = suggestSheetsMapping(input);
  m.policy.currency = "UAH";
  m.policy.statuses = { "5": "SALE" };
  const products = sheets.find((s) => s.key === "product_yml")!.rows,
    orders = sheets.find((s) => s.key === "zavod_api")!.rows;
  orders[0].data[m.orders.salesAmount!] = "12.0000";
  orders[0].data[m.orders.costAmount!] = "6.0000";
  const compiled = compileSheetsProjection(input, m, { products, orders });
  const transport = vi.fn(async () =>
    Response.json({
      data: [
        {
          id: 1,
          statusId: 5,
          paymentDate: "2026-10-20",
          products: [
            {
              id: "line",
              productId: "p",
              sku: "sku",
              amount: 3,
              price: 4,
              costPrice: 2,
            },
          ],
        },
      ],
      pagination: { currentPage: 1, pageCount: 1 },
    }),
  );
  const connector = new SalesDriveConnector(
    {
      accountHost: "example.salesdrive.me",
      ordersApiKey: "synthetic-only",
      receiptsApiKey: null,
      ymlUrl: null,
    },
    transport,
  );
  const page = await connector.getOrders();
  const sheet = normalizeOrder(
    compiled.orders[0],
    input.timezone,
    sheetsOrderPolicy(m),
  ).lines[0];
  const remote = normalizeOrder(page.records[0], input.timezone, {
    statuses: { "5": "SALE" },
    amounts: {
      price: "net_unit",
      cost: "unit",
      absoluteDiscount: "line",
      currency: "UAH",
    },
  }).lines[0];
  const fact = (line: typeof sheet) => ({
    quantity: line.signedQuantity?.toString(),
    revenue: line.signedRevenue?.toString(),
    cost: line.signedCost?.toString(),
    paidAt: line.paidAt?.toISOString(),
    currency: line.currency,
    kind: line.kind,
  });
  expect(fact(sheet)).toEqual(fact(remote));
  expect(fact(sheet)).toMatchObject({
    quantity: "3",
    revenue: "12",
    cost: "6",
  });
  expect(transport).toHaveBeenCalledTimes(1);
});

it("returns a diagnostic finding instead of throwing when all product names are blank", () => {
  const result = inspectSheetsOffline(fixture("   "), instant);
  expect(result.findings).toContain("EMPTY_PRODUCT_SNAPSHOT");
  expect(result.structural).toBeNull();
  expect(result.financialRows).toBe(0);
  expect(result.activated).toBe(false);
});
it("saves only allowlisted aggregates without source-keyed dictionaries", () => {
  const result = inspectSheetsOffline(fixture(), instant);
  expect(result.issues).not.toHaveProperty("categoryCounts");
  expect(result.issues).not.toHaveProperty("statusCounts");
  expect(result.issues).not.toHaveProperty("channelCounts");
  expect(result.issues).not.toHaveProperty("problems");
  expect(JSON.stringify(result)).not.toContain("Private fixture category");
});
