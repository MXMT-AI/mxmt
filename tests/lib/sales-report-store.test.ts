import { createMerchandisingDb } from "../helpers/merchandising-db";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import type { SqlDatabase } from "@/lib/connectors/database";
import type { OrderDto } from "@/lib/connectors/contract";
import { getSalesReport, readPublishedSalesReport } from "@/lib/sales-report";
import { storeOrder } from "@/lib/connectors/order-storage";
import {
  saveMerchandisingSettings,
  readClientSettings,
} from "@/lib/merchandising-settings-store";
import { salesReportView } from "@/lib/sales-report-view";
let pg: PGlite, db: SqlDatabase;
const policy = {
  statuses: {
    "5": "SALE" as const,
    "7": "RETURN" as const,
    "33": "PREORDER" as const,
  },
  channels: { "1": "Store" },
  amounts: {
    price: "gross_unit" as const,
    absoluteDiscount: "line" as const,
    currency: "UAH",
    cost: "unit" as const,
  },
};
const args = {
  dateFrom: "2026-10-01",
  dateTo: "2026-10-15",
  now: new Date("2026-10-25T10:00Z"),
};
function order(id: string, date: string, status = "5"): OrderDto {
  return {
    externalId: id,
    observedAt: "2026-10-24T13:00Z",
    updatedAt: "2026-10-24T12:00Z",
    orderedAt: date,
    paidAt: date,
    returnedAt: status === "7" ? date : null,
    statusId: status,
    channelId: "1",
    raw: { id, date, status },
    lines: [
      {
        externalLineId: "1",
        productId: "product",
        sku: "SKU",
        quantity: "2",
        unitPrice: "100",
        discount: "10",
        discountUnit: "percentage",
        costPrice: "60",
        commission: null,
        commissionUnit: "unknown",
      },
    ],
  };
}
beforeAll(async () => {
  ({ pg, db } = await createMerchandisingDb());
  await pg.exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now()),('b','B','b',now());
 INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('owner','owner@example.test','test','Owner','ADMIN','a',now());
 INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('source','a','SALESDRIVE','fixture',now());
 INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","updatedAt") VALUES ('connection','a','source','demo.salesdrive.me','test',now());
 INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt","completedAt") VALUES ('run','a','source','MANUAL','SUCCESS','fixture',now(),now(),now());
 INSERT INTO "Brand" (id,"tenantId",name,ownership) VALUES ('brand','a','Brand','OWN');
 INSERT INTO "Category" (id,"tenantId",key,name,"updatedAt") VALUES ('category','a','category','Category',now());
 INSERT INTO "Sku" (id,"tenantId",sku,name,category,"brandId","categoryId","productKind") VALUES ('sku','a','SKU','Item','Category','brand','category','MERCHANDISE');
 INSERT INTO "SkuAlias" (id,"tenantId","skuId","sourceId",type,value) VALUES ('alias','a','sku','source','SOURCE_PRODUCT_ID','product');`);
  await pg.query(
    `INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference") VALUES ('mapping','a','SOURCE_MAPPING','salesdrive:source',1,$1,true,'owner',now(),'fixture')`,
    [JSON.stringify(policy)],
  );
  await pg.query(
    `INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",resource,mode,state,"connectionRevision",checkpoint,stats,"updatedAt") VALUES ('job','a','source','run','orders','BACKFILL','COMPLETE',1,$1,'{}',now())`,
    [
      JSON.stringify({
        from: "2024-10-01T10:00:00Z",
        to: "2026-10-25T10:00:00Z",
        policy,
      }),
    ],
  );
  await pg.exec(
    `INSERT INTO "SyncCursor" (id,"tenantId","sourceId",resource,checkpoint,"lastSuccessfulRunId","updatedAt") VALUES ('cursor','a','source','orders','{"through":"2026-10-25T10:00:00Z"}','run',now());`,
  );
  for (const value of [
    order("current", "2026-10-05"),
    order("ly", "2025-10-05"),
    order("unrelated-month", "2026-03-05"),
  ])
    await db.$transaction((tx) =>
      storeOrder(
        tx,
        {
          tenantId: "a",
          sourceId: "source",
          importRunId: "run",
          timezone: "Europe/Kyiv",
        },
        value,
        policy,
      ),
    );
}, 30000);
afterAll(async () => pg?.close());
describe("frozen SalesDrive financial reports", () => {
  it("runs production SQL in one snapshot, reuses the calculation lifecycle and returns identical cached views", async () => {
    const one = await getSalesReport("a", args, db),
      two = await getSalesReport("a", args, db);
    expect(two).toEqual(one);
    expect(one.provenance.factCount).toBe(2);
    expect(one.history).toEqual({ current: true, ly: true });
    expect(one.summary[0].current).toMatchObject({
      revenue: "180",
      units: "2",
      coveredGrossProfit: "60",
    });
    expect(one.summary[0].revenueChangePct).toBe("0");
    expect(
      (await pg.query('SELECT count(*)::int n FROM "ReportCalculationRun"'))
        .rows,
    ).toEqual([{ n: 1 }]);
    for (const view of [
      "articles",
      "brands",
      "categories",
      "channels",
    ] as const)
      expect(
        salesReportView(one, {
          view,
          page: 1,
          pageSize: 25,
          q: "",
          sort: "revenue",
          direction: "desc",
        }).rows[0].revenue,
      ).toBe("180");
  });
  it("retries a serialization conflict with a fresh snapshot and retains the same tenant result", async () => {
    const retry = vi
      .fn()
      .mockRejectedValueOnce({ code: "P2010", meta: { code: "40001" } })
      .mockImplementation(db.$transaction);
    const report = await getSalesReport("a", args, {
      ...db,
      $transaction: retry,
    });
    expect(report.summary[0].current.revenue).toBe("180");
    expect(retry).toHaveBeenCalledTimes(2);
    const view = salesReportView(report, {
      view: "brands",
      page: 1,
      pageSize: 25,
      q: "",
      sort: "revenueDelta",
      direction: "desc",
    });
    expect(view.rows[0]).toMatchObject({
      revenueDelta: "0",
      lyCoveredGrossProfit: "60",
      lyGmPct: expect.any(String),
    });
  });
  it("isolates source discovery and frozen results by the authenticated tenant", async () => {
    const report = await getSalesReport("a", args, db);
    await expect(getSalesReport("b", args, db)).rejects.toMatchObject({
      code: "SALESDRIVE_NOT_CONFIGURED",
    });
    await expect(
      readPublishedSalesReport("b", report.calculationRunId, db),
    ).rejects.toMatchObject({ code: "SALES_REPORT_NOT_FOUND" });
  });
  it("recognizes a return on its actual date and keeps paid preorders out of sales/profit", async () => {
    const refund = {
      ...order("refund", "2026-09-28", "7"),
      returnedAt: "2026-10-20",
      raw: { id: "refund", returnedAt: "2026-10-20" },
    };
    const pre = order("preorder", "2026-10-20", "33");
    pre.lines = [
      { ...pre.lines[0], quantity: "1", unitPrice: "300", discount: "0" },
    ];
    for (const value of [refund, pre])
      await db.$transaction((tx) =>
        storeOrder(
          tx,
          {
            tenantId: "a",
            sourceId: "source",
            importRunId: "run",
            timezone: "Europe/Kyiv",
          },
          value,
          policy,
        ),
      );
    const report = await getSalesReport(
      "a",
      { ...args, dateFrom: "2026-10-20", dateTo: "2026-10-20" },
      db,
    );
    expect(report.summary[0].current).toMatchObject({
      revenue: "-180",
      coveredGrossProfit: "-60",
      returnOrderCount: 1,
      orderCount: 0,
    });
    expect(report.preorders[0]).toMatchObject({
      paidAmount: "300",
      recognition: "NOT_RECOGNIZED_SALE",
      orderCount: 1,
    });
    expect(report.preorders[0]).not.toHaveProperty("coveredGrossProfit");
  });
  it("discloses quarantined orders instead of labelling an incomplete import as covered history", async () => {
    await pg.exec(
      `UPDATE "ConnectorSyncJob" SET stats='{"quarantined":1}' WHERE id='job'`,
    );
    const report = await getSalesReport("a", args, db);
    expect(report.history.current).toBe(false);
    expect(report.issues).toContainEqual({
      code: "IMPORT_QUARANTINED",
      count: 1,
      examples: [],
    });
    await pg.exec(`UPDATE "ConnectorSyncJob" SET stats='{}' WHERE id='job'`);
  });
  it("publishes a new result for ownership/config changes and preserves the previous report", async () => {
    const before = await getSalesReport("a", args, db);
    await saveMerchandisingSettings(
      "a",
      "owner",
      "sku",
      "sku",
      0,
      { ownershipOverride: "CONSIGNMENT", commissionPct: 25, supplierId: null },
      db,
    );
    const after = await getSalesReport("a", args, db);
    expect(after.inputKey).not.toBe(before.inputKey);
    expect(after.summary[0].current.coveredGrossProfit).toBe("45");
    expect(
      (await readPublishedSalesReport("a", before.calculationRunId, db))
        .summary[0].current.coveredGrossProfit,
    ).toBe("60");
  });
  it("invalidates current inputs after filter changes instead of trusting an old import policy", async () => {
    const client = await readClientSettings("a", db);
    await saveMerchandisingSettings(
      "a",
      "owner",
      "client",
      null,
      client.revision,
      { ...client.values, excludedChannels: ["99"] },
      db,
    );
    const report = await getSalesReport("a", args, db);
    expect(report.history).toEqual({ current: false, ly: false });
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "NORMALIZATION_REPLAY_REQUIRED",
        count: 2,
      }),
    );
    expect(report.summary[0].current.coverage).not.toBe("COMPLETE");
  });
  it("marks in-flight sources as incomplete and validates the additive result-shape constraint", async () => {
    await pg.exec(`INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES ('busy-run','a','source','MANUAL','RUNNING','busy',now(),now());
 INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",resource,mode,state,"connectionRevision",checkpoint,stats,"updatedAt") VALUES ('busy-job','a','source','busy-run','orders','INCREMENTAL','RUNNING',1,'{}','{}',now());`);
    const report = await getSalesReport("a", args, db);
    expect(report.provenance.sourceBusy).toBe(true);
    expect(report.history.current).toBe(false);
    await expect(
      pg.exec(
        `UPDATE "ReportCalculationRun" SET "financialResult"='[]' WHERE "reportKind"='SALESDRIVE'`,
      ),
    ).rejects.toThrow();
  });
});
