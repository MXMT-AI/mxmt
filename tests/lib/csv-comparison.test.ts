import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb, screenSelection } from "../helpers/screen-db";
import { csvOptions, csvFile } from "../fixtures/csv-connector";
import type { CsvOptions } from "@/lib/connectors/csv/schema";
import {
  previewCsv,
  csvImportAction,
  readCsvImport,
} from "@/lib/connectors/csv/store";
import { processCsvJob } from "@/lib/connectors/csv/worker";
import { selectConnectorSource } from "@/lib/connectors/source";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { getSalesReport } from "@/lib/sales-report";
import { calculateSkuDaily } from "@/lib/sku-daily-store";
import {
  SCREEN_NAMES,
  parseScreenQuery,
} from "@/lib/merchandising-screen-query";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import {
  createRepricingInputs,
  getRepricingPreview,
} from "@/lib/repricing-store";
import { getReorderingPreview } from "@/lib/reordering-store";
import {
  createScenarioExport,
  readScenarioExportFile,
} from "@/lib/scenario-export-store";
let f: Awaited<ReturnType<typeof createScreenDb>>;
beforeAll(async () => {
  vi.stubEnv(
    "CONNECTOR_ENCRYPTION_KEY",
    Buffer.alloc(32, 8).toString("base64"),
  );
  f = await createScreenDb();
}, 30000);
afterAll(async () => {
  await f?.pg.close();
  vi.unstubAllEnvs();
});
it("matches equivalent facts through unchanged metrics, all five screens and both real scenario exports", async () => {
  await f.pg
    .exec(`UPDATE "Brand" SET ownership='OWN',"commissionRate"=NULL WHERE "tenantId"='a';
 UPDATE "InventorySnapshot" SET currency='UAH';
 UPDATE "InventorySnapshot" SET quantity=1 WHERE "skuId"='sku-a' AND "snapshotDate"='2026-10-25';
 UPDATE "ReceiptLine" l SET "unitCost"=CASE l."skuId" WHEN 'sku-a' THEN 10 WHEN 'sku-b' THEN 5 WHEN 'sku-c' THEN 7 ELSE 8 END,currency='UAH',"costVerifiedAt"=now();`);
  const orders = (
    await f.pg.query<Record<string, string>>(
      `SELECT l."externalOrderId" "orderId",'current' "eventId",regexp_replace(l."externalLineId",'^native:','') "lineId",l."externalProductId" "productId",COALESCE(l."sourceSku",'') sku,l."statusId"::text "statusId",COALESCE(l."channelId",'') "channelId",to_char(l."orderedAt" AT TIME ZONE 'Europe/Kyiv','YYYY-MM-DD') "orderedAt",COALESCE(to_char(l."paidAt" AT TIME ZONE 'Europe/Kyiv','YYYY-MM-DD'),'') "paidAt",COALESCE(to_char(l."returnedAt" AT TIME ZONE 'Europe/Kyiv','YYYY-MM-DD'),'') "returnedAt",to_char(l."sourceUpdatedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "updatedAt",l.quantity::text quantity,l."sourceAmounts"->>'unitPrice' "unitPrice",l."sourceAmounts"->>'discount' discount,l."sourceAmounts"->>'unitCost' "costPrice" FROM "OrderLine" l WHERE l."sourceId"='source' ORDER BY l."externalOrderId",l."externalLineId"`,
    )
  ).rows;
  const products = (
    await f.pg.query<Record<string, string>>(
      `SELECT s.id "productId",s.sku,s.name,COALESCE(s.barcode,'') barcode,COALESCE(b.name,'') brand,s."categoryId" "categoryId",s.category "categoryName",'20' "retailPrice",'2026-08-01T00:00:00.000Z' "observedAt" FROM "Sku" s LEFT JOIN "Brand" b ON b.id=s."brandId" WHERE s."tenantId"='a' ORDER BY s.id`,
    )
  ).rows;
  const stock = (
    await f.pg.query<Record<string, string>>(
      `SELECT "skuId" "productId",to_char("observedAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') "observedAt",quantity::text quantity FROM "InventorySnapshot" WHERE "sourceId"='source' ORDER BY "observedAt","skuId"`,
    )
  ).rows;
  const receipts = (
    await f.pg.query<Record<string, string>>(
      `SELECT r."externalId" "documentId",l."externalLineId" "lineId",l."skuId" "productId",s.sku,'1' "supplierId",'1' "statusId",'supplier_receipt' "movementType",to_char(r."receivedAt" AT TIME ZONE 'Europe/Kyiv','YYYY-MM-DD') "receivedAt",'2026-10-25T08:00:00.000Z' "updatedAt",l.quantity::text quantity,l."unitCost"::text "unitCost" FROM "ReceiptLine" l JOIN "Receipt" r ON r.id=l."receiptId" JOIN "Sku" s ON s.id=l."skuId" WHERE r."sourceId"='source' ORDER BY r.id,l.id`,
    )
  ).rows;
  const options: CsvOptions = {
    ...csvOptions,
    receiptBaseline: true,
    receiptHistory: csvOptions.history,
    policy: {
      ...csvOptions.policy,
      statuses: { "5": "SALE", "7": "RETURN", "33": "PREORDER" },
      channels: { "1": "Shop", "2": "Online" },
      receipts: {
        postedStatuses: ["1"],
        suppliers: { "1": "supplier" },
        currency: "UAH",
        unitCostVerified: true,
        productIdField: "id",
      },
    },
  };
  const collect = async (csv = false) => {
    const sales = await getSalesReport("a", screenSelection, f.db),
      daily = await calculateSkuDaily("a", screenSelection, f.db),
      snapshot = await createScreenSnapshot("a", screenSelection, f.db);
    const screens = await Promise.all(
      SCREEN_NAMES.map(async (screen) => {
        const view = await getMerchandisingScreen(
          "a",
          screen,
          parseScreenQuery(
            new URLSearchParams({ snapshotId: snapshot.snapshotId }),
            screen,
          ),
          f.db,
          screenSelection.now,
        );
        return {
          screen,
          dataState: view.dataState,
          sales: view.sales?.summary,
          stock: view.stock?.summary,
        };
      }),
    );
    const inputs = await createRepricingInputs(
      "a",
      snapshot.snapshotId,
      f.db,
      screenSelection.now,
    );
    const repricingScenario = {
        inputSetId: inputs.inputSetId,
        filters: { skuId: "sku-d" },
      },
      repricing = await getRepricingPreview("a", repricingScenario, f.db);
    const reorderScenario = {
        snapshotId: snapshot.snapshotId,
        filters: { skuId: "sku-a" },
        overrides: [{ skuId: "sku-a", inTransitQuantity: "0" }],
      },
      reorder = await getReorderingPreview("a", reorderScenario, f.db);
    expect(repricing.canExport).toBe(true);
    expect(reorder.canExport).toBe(true);
    const repricingReceipt = await createScenarioExport(
      "a",
      "owner",
      {
        exportId: csv
          ? "33333333-3333-4333-8333-333333333333"
          : "11111111-1111-4111-8111-111111111111",
        kind: "reprice",
        previewId: repricing.previewId,
        scenario: repricingScenario,
      },
      f.db,
      screenSelection.now,
    );
    const reorderReceipt = await createScenarioExport(
      "a",
      "owner",
      {
        exportId: csv
          ? "44444444-4444-4444-8444-444444444444"
          : "22222222-2222-4222-8222-222222222222",
        kind: "reorder",
        previewId: reorder.previewId,
        scenario: reorderScenario,
      },
      f.db,
      screenSelection.now,
    );
    const files = await Promise.all(
      [repricingReceipt, reorderReceipt].map(async (receipt) => {
        expect(receipt.files.length).toBeGreaterThan(0);
        return Promise.all(
          receipt.files.map(
            async (file) =>
              (
                await readScenarioExportFile(
                  "a",
                  receipt.exportId,
                  file.id,
                  f.db,
                )
              ).content,
          ),
        );
      }),
    );
    return {
      sales: sales.summary,
      history: sales.history,
      daily: daily.summary,
      screens,
      files,
    };
  };
  const baseline = await collect();
  const upload = await previewCsv(
    "a",
    "owner",
    null,
    options,
    [
      csvFile("products", products),
      csvFile("stock", stock),
      csvFile("orders", orders),
      csvFile("receipts", receipts),
    ],
    f.db,
  );
  expect(upload.preview.errors).toEqual([]);
  await selectConnectorSource("a", "owner", upload.sourceId, 0, f.db);
  await csvImportAction(
    "a",
    "owner",
    upload.id,
    upload.contentHash,
    "activate",
    f.db,
  );
  let failure: unknown;
  await processCsvJob("a", {
    ...f.db,
    $transaction: async (cb, opts) => {
      try {
        return await f.db.$transaction(cb, opts);
      } catch (e) {
        failure = e;
        throw e;
      }
    },
  });
  expect(failure).toBeUndefined();
  expect((await readCsvImport("a", upload.id, f.db)).state).toBe("ACTIVE");
  const actual = await collect(true);
  expect(actual).toEqual(baseline);
}, 30000);
