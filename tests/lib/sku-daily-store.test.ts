import { payloadHash } from "@/lib/connectors/order-storage";
import { inventoryPolicy } from "@/lib/connectors/inventory-normalization";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createMerchandisingDb } from "../helpers/merchandising-db";
import type { SqlDatabase } from "@/lib/connectors/database";
import type { OrderDto } from "@/lib/connectors/contract";
import type { OrderPolicy } from "@/lib/connectors/order-normalization";
import { storeOrder } from "@/lib/connectors/order-storage";
import { calculateSkuDaily, readSkuDaily } from "@/lib/sku-daily-store";
import {
  saveMerchandisingSettings,
  readClientSettings,
} from "@/lib/merchandising-settings-store";
import { applyClientOrderSettings } from "@/lib/merchandising-order-policy";
import { getSalesReport } from "@/lib/sales-report";
let pg: PGlite, db: SqlDatabase;
const args = { asOf: "2026-10-25", now: new Date("2026-10-25T10:00:00Z") };
const query = {
  page: 1,
  pageSize: 25,
  q: "",
  sort: "sku" as const,
  direction: "asc" as const,
};
const policy = {
  statuses: {
    "5": "SALE" as const,
    "7": "RETURN" as const,
    "33": "PREORDER" as const,
  },
  amounts: {
    price: "gross_unit" as const,
    absoluteDiscount: "line" as const,
    currency: "UAH",
    cost: "unit" as const,
  },
};
const fullMapping = {
  ...policy,
  receipts: {
    postedStatuses: ["1"],
    suppliers: { "1": "supplier" },
    productIdField: "id",
    currency: "UAH",
    unitCostVerified: true,
  },
};
const receiptPolicy = inventoryPolicy(fullMapping),
  receiptPolicyHash = payloadHash(receiptPolicy);
function order(
  id: string,
  date: string,
  quantity = "28",
  status = "5",
): OrderDto {
  return {
    externalId: id,
    observedAt: "2026-10-24T12:00Z",
    updatedAt: "2026-10-24T11:00Z",
    orderedAt: date,
    paidAt: date,
    returnedAt: status === "7" ? date : null,
    statusId: status,
    channelId: "1",
    raw: { id, date, quantity, status },
    lines: [
      {
        externalLineId: "1",
        productId: "product",
        sku: "SKU",
        quantity,
        unitPrice: "20",
        discount: "0",
        discountUnit: "amount",
        costPrice: "10",
        commission: null,
        commissionUnit: "unknown",
      },
    ],
  };
}
const store = async (value: OrderDto, currentPolicy: OrderPolicy = policy) =>
  db.$transaction((tx) =>
    storeOrder(
      tx,
      {
        tenantId: "a",
        sourceId: "source",
        importRunId: "run",
        timezone: "Europe/Kyiv",
      },
      value,
      currentPolicy,
    ),
  );
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
 INSERT INTO "SkuAlias" (id,"tenantId","skuId","sourceId",type,value) VALUES ('alias','a','sku','source','SOURCE_PRODUCT_ID','product');
 INSERT INTO "Receipt" (id,"tenantId","sourceId","importRunId","externalId","movementType","postingVerifiedAt","receivedAt","observedAt","sourceRecordKey","updatedAt") VALUES ('receipt','a','source','run','r1','SUPPLIER_RECEIPT',now(),'2026-06-01T00:00:00+03:00','2026-06-01T03:00:00+03:00','receipt-raw',now()),('transfer','a','source','run','r2','TRANSFER',now(),'2026-10-24T00:00:00+03:00','2026-10-24T03:00:00+03:00','transfer-raw',now());
 INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId","skuId",quantity) VALUES ('receipt-line','a','receipt','1','sku',100),('transfer-line','a','transfer','1','sku',100);
 INSERT INTO "InventorySnapshot" (id,"tenantId","skuId",quantity,"snapshotDate","observedAt",timezone,"costPrice","retailPrice",currency,"sourceId","importRunId","sourceRecordKey") SELECT 'snapshot:'||d::date,'a','sku',14,d::date,(d::date::timestamp+interval '3 hours') AT TIME ZONE 'Europe/Kyiv','Europe/Kyiv',10,20,'UAH','source','run','stock:'||d::date FROM generate_series('2026-08-02'::date,'2026-10-25'::date,'1 day') d;`);
  await pg.query(
    `INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference") VALUES ('mapping','a','SOURCE_MAPPING','salesdrive:source',1,$1,true,'owner',now(),'fixture')`,
    [JSON.stringify(fullMapping)],
  );
  await pg.query(
    `INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",resource,mode,state,"connectionRevision",checkpoint,stats,"updatedAt") VALUES ('job','a','source','run','orders','BACKFILL','COMPLETE',1,$1,'{}',now())`,
    [
      JSON.stringify({
        from: "2025-01-01T00:00:00+02:00",
        to: "2026-10-25T09:00:00Z",
        policy,
      }),
    ],
  );
  await pg.exec(
    `INSERT INTO "SyncCursor" (id,"tenantId","sourceId",resource,checkpoint,"lastSuccessfulRunId","updatedAt") VALUES ('cursor','a','source','orders','{"through":"2026-10-25T09:00:00Z"}','run',now());`,
  );
  await pg.exec(`INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt","completedAt") VALUES ('receipt-run','a','source','MANUAL','SUCCESS','receipt-fixture',now(),now(),now());
  INSERT INTO "Supplier" (id,"tenantId",key,name,"updatedAt") VALUES ('supplier','a','supplier','Supplier',now());
  UPDATE "Receipt" SET "importRunId"='receipt-run',"supplierId"='supplier',"sourceCounterpartyId"='1';`);
  await pg.query(
    `INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",resource,mode,state,"connectionRevision",checkpoint,stats,"updatedAt") VALUES ('receipt-job','a','source','receipt-run','inventory','REFRESH','COMPLETE',1,$1,'{"pages":1}',now())`,
    [
      JSON.stringify({
        stage: "catalog",
        to: "2026-10-25T09:00:00Z",
        policy: receiptPolicy,
        policyHash: receiptPolicyHash,
      }),
    ],
  );
  await pg.query(
    `INSERT INTO "SyncCursor" (id,"tenantId","sourceId",resource,checkpoint,"lastSuccessfulRunId","updatedAt") VALUES ('receipt-cursor','a','source','receipts',$1,'receipt-run',now())`,
    [
      JSON.stringify({
        through: "2026-10-25T09:00:00Z",
        policyHash: receiptPolicyHash,
      }),
    ],
  );
  await store(order("august", "2026-08-20"));
  await store(order("september", "2026-09-20"));
  await store(order("return", "2026-09-22", "-7", "7"));
  await store({
    ...order("current-day", "2026-10-25", "50"),
    observedAt: "2026-10-25T09:00:00Z",
    updatedAt: "2026-10-25T08:00:00Z",
  });
}, 30000);
afterAll(async () => pg?.close());
describe("daily materialization with production SQL", () => {
  it("calculates source-scoped metrics, persists typed columns and retains actual observation time", async () => {
    const result = await calculateSkuDaily("a", args, db),
      data = await readSkuDaily("a", result.calculationId, query, db);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({
      salesUnits12Weeks: "49",
      cohortSalesUnits: "49",
      cohortWindowTo: "2026-10-24",
      velocityPerWeek: expect.any(String),
      velocityBasis: "SNAPSHOT_DAYS",
      snapshotHistory: { observedDays: 84, inStockDays: 84, complete: true },
      quantity: "14",
      firstReceiptDate: "2026-06-01",
      lastReceiptDate: "2026-06-01",
      stockCostValue: "140",
      cogs3Months: "490",
      active: true,
      classification: "HEALTHY",
      shortage: true,
      ownership: "OWN",
    });
    expect(data.calculationVersion).toBe(2);
    expect(data.brands).toEqual([
      expect.objectContaining({
        brandId: "brand",
        signal: "HEALTHY",
        ownership: "OWN",
      }),
    ]);
    expect(data.summary.shortageSkuCount).toBe(1);
    const statuses = (
      await pg.query(
        `SELECT classification,metrics->>'classification' "savedStatus" FROM "SkuDaily" WHERE "configId"=$1`,
        [result.calculationId],
      )
    ).rows;
    expect(statuses).toEqual([
      { classification: "HEALTHY", savedStatus: "HEALTHY" },
    ]);
    expect(data.summary.availability).toMatchObject({
      ratio: "1",
      activeSkuCount: 1,
    });
    const stored = (
      await pg.query(
        `SELECT "businessDate"::text "day","velocityPerWeek"::text velocity,"sourceObservedAt" FROM (SELECT *,"inputProvenance"->>'sourceObservedAt' "sourceObservedAt" FROM "SkuDaily") d`,
      )
    ).rows[0] as Record<string, unknown>;
    expect(stored.day).toBe("2026-10-25");
    expect(stored.sourceObservedAt).toContain("2026-10-25");
  });
  it("is idempotent even when the clock advances without input changes", async () => {
    const one = await calculateSkuDaily("a", args, db),
      two = await calculateSkuDaily(
        "a",
        { ...args, now: new Date("2026-10-25T10:05:00Z") },
        db,
      );
    expect(two).toEqual(one);
    expect(
      (await pg.query('SELECT count(*)::int n FROM "SkuDaily"')).rows,
    ).toEqual([{ n: 1 }]);
    expect((await readClientSettings("a", db)).id).toBeNull();
  });
  it("isolates both source discovery and immutable daily reads by tenant", async () => {
    const result = await calculateSkuDaily("a", args, db);
    await expect(calculateSkuDaily("b", args, db)).rejects.toMatchObject({
      code: "SALESDRIVE_NOT_CONFIGURED",
    });
    await expect(
      readSkuDaily("b", result.calculationId, query, db),
    ).rejects.toMatchObject({ code: "DAILY_CALCULATION_NOT_FOUND" });
  });
  it("does not relabel the current stock pull as a missing historical date", async () => {
    const result = await calculateSkuDaily(
        "a",
        { ...args, asOf: "2026-07-31" },
        db,
      ),
      data = await readSkuDaily("a", result.calculationId, query, db);
    expect(data.rows[0]).toMatchObject({
      asOf: "2026-07-31",
      snapshotId: null,
      quantity: null,
      weeksOnHand: null,
      stockCostValue: null,
    });
  });
  it("does not infer inactive SKUs or a confirmed cohort from missing/stale receipt coverage", async () => {
    await pg.exec(
      `UPDATE "SyncCursor" SET checkpoint=jsonb_set(checkpoint,'{policyHash}','"stale"') WHERE id='receipt-cursor'`,
    );
    const result = await calculateSkuDaily(
        "a",
        { ...args, asOf: "2026-07-31" },
        db,
      ),
      data = await readSkuDaily("a", result.calculationId, query, db);
    expect(result.provenance.receiptHistoryComplete).toBe(false);
    expect(data.rows[0]).toMatchObject({
      active: null,
      firstReceiptDate: null,
      sellThroughRatio: null,
    });
    await pg.query(
      `UPDATE "SyncCursor" SET checkpoint=jsonb_set(checkpoint,'{policyHash}',$1::jsonb) WHERE id='receipt-cursor'`,
      [JSON.stringify(receiptPolicyHash)],
    );
  });
  it("recognizes the actual inventory worker resource as an in-flight source", async () => {
    await pg.exec(`INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES ('busy-inventory-run','a','source','MANUAL','RUNNING','busy-inventory',now(),now());
   INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",resource,mode,state,"connectionRevision",checkpoint,stats,"updatedAt") VALUES ('busy-inventory-job','a','source','busy-inventory-run','inventory','REFRESH','RUNNING',1,'{}','{}',now());`);
    const result = await calculateSkuDaily("a", args, db),
      data = await readSkuDaily("a", result.calculationId, query, db);
    expect(result.provenance.sourceBusy).toBe(true);
    expect(data.rows[0]).toMatchObject({
      velocityPerWeek: null,
      velocityState: "UNKNOWN",
    });
    await pg.exec(
      `DELETE FROM "ConnectorSyncJob" WHERE id='busy-inventory-job';DELETE FROM "DataImportRun" WHERE id='busy-inventory-run'`,
    );
  });
  it("uses receipt fallback after a gap without resetting the first-receipt STR cohort", async () => {
    const before = await calculateSkuDaily("a", args, db);
    await pg.exec(`DELETE FROM "InventorySnapshot" WHERE id='snapshot:2026-08-02';
 UPDATE "Receipt" SET "receivedAt"='2026-10-23T00:00:00+03:00',"movementType"='SUPPLIER_RECEIPT' WHERE id='transfer';`);
    const after = await calculateSkuDaily("a", args, db),
      data = await readSkuDaily("a", after.calculationId, query, db);
    expect(after.inputKey).not.toBe(before.inputKey);
    expect(data.rows[0]).toMatchObject({
      velocityBasis: "RECEIPT_FALLBACK",
      denominatorWeeks: "4",
      firstReceiptDate: "2026-06-01",
      lastReceiptDate: "2026-10-23",
      snapshotHistory: { complete: false, observedDays: 83 },
    });
    expect(
      (await readSkuDaily("a", before.calculationId, query, db)).rows[0],
    ).toMatchObject({
      velocityBasis: "SNAPSHOT_DAYS",
      lastReceiptDate: "2026-06-01",
    });
  });
  it("uses saved seasons and frozen names without changing older calculation reads", async () => {
    const before = await calculateSkuDaily("a", args, db);
    await saveMerchandisingSettings(
      "a",
      "owner",
      "category",
      "category",
      0,
      { seasonMonths: [11] },
      db,
    );
    const after = await calculateSkuDaily("a", args, db);
    expect(after.summary.availability).toMatchObject({
      ratio: null,
      activeSkuCount: 0,
    });
    await pg.exec(
      `UPDATE "Sku" SET name='Completely different' WHERE id='sku'`,
    );
    expect(
      (
        await readSkuDaily(
          "a",
          before.calculationId,
          { ...query, q: "Item" },
          db,
        )
      ).rows[0],
    ).toMatchObject({ name: "Item", active: true });
  });
  it("requires policy replay after changing exclusions, including previously excluded orders", async () => {
    const client = await readClientSettings("a", db);
    await saveMerchandisingSettings(
      "a",
      "owner",
      "client",
      null,
      client.revision,
      { ...client.values, excludedChannels: ["1"] },
      db,
    );
    let current = await readClientSettings("a", db);
    const excludedPolicy = applyClientOrderSettings(policy, current.values, {
      id: current.id!,
      revision: current.revision,
    });
    await pg.query(
      `UPDATE "ConnectorSyncJob" SET checkpoint=jsonb_set(checkpoint,'{policy}',$1) WHERE id='job'`,
      [JSON.stringify(excludedPolicy)],
    );
    for (const value of [
      order("august", "2026-08-20"),
      order("september", "2026-09-20"),
      order("return", "2026-09-22", "-7", "7"),
    ])
      await store(value, excludedPolicy);
    current = await readClientSettings("a", db);
    await saveMerchandisingSettings(
      "a",
      "owner",
      "client",
      null,
      current.revision,
      { ...current.values, excludedChannels: [] },
      db,
    );
    const result = await calculateSkuDaily("a", args, db),
      data = await readSkuDaily("a", result.calculationId, query, db);
    expect(data.rows[0]).toMatchObject({
      velocityPerWeek: null,
      velocityState: "UNKNOWN",
    });
    const financial = await getSalesReport(
      "a",
      { dateFrom: "2026-09-01", dateTo: "2026-09-30", now: args.now },
      db,
    );
    expect(financial.history.current).toBe(false);
    expect(financial.issues).toContainEqual(
      expect.objectContaining({ code: "NORMALIZATION_REPLAY_REQUIRED" }),
    );
  });
  it("blocks unverified project mappings even when normalization has already removed signed amounts", async () => {
    await pg.exec(`DELETE FROM "OrderLine" WHERE "tenantId"='a'`);
    let c = await readClientSettings("a", db);
    await saveMerchandisingSettings(
      "a",
      "owner",
      "client",
      null,
      c.revision,
      { ...c.values, excludedProjects: ["blocked"], projectField: "projectId" },
      db,
    );
    c = await readClientSettings("a", db);
    const active = applyClientOrderSettings(policy, c.values, {
      id: c.id!,
      revision: c.revision,
    });
    await pg.query(
      `UPDATE "ConnectorSyncJob" SET checkpoint=jsonb_set(checkpoint,'{policy}',$1) WHERE id='job'`,
      [JSON.stringify(active)],
    );
    await store(order("project-missing", "2026-10-10", "5"), active);
    const calculation = await calculateSkuDaily("a", args, db),
      data = await readSkuDaily("a", calculation.calculationId, query, db);
    expect(data.rows[0]).toMatchObject({
      velocityPerWeek: null,
      velocityState: "UNKNOWN",
      cogs3Months: null,
    });
  });
  it("honors an approved preorder mapping even if a client sale-status list contains 33", async () => {
    await pg.exec(`DELETE FROM "OrderLine" WHERE "tenantId"='a'`);
    let c = await readClientSettings("a", db);
    await saveMerchandisingSettings(
      "a",
      "owner",
      "client",
      null,
      c.revision,
      {
        ...c.values,
        excludedProjects: [],
        projectField: null,
        saleStatuses: ["5", "33"],
        saleStatusesVerified: true,
      },
      db,
    );
    c = await readClientSettings("a", db);
    const active = applyClientOrderSettings(policy, c.values, {
      id: c.id!,
      revision: c.revision,
    });
    await pg.query(
      `UPDATE "ConnectorSyncJob" SET checkpoint=jsonb_set(checkpoint,'{policy}',$1) WHERE id='job'`,
      [JSON.stringify(active)],
    );
    await store(order("preorder", "2026-10-10", "28", "33"), active);
    const calculation = await calculateSkuDaily("a", args, db),
      data = await readSkuDaily("a", calculation.calculationId, query, db);
    expect(data.rows[0]).toMatchObject({
      salesUnits12Weeks: "0",
      velocityPerWeek: "0",
      velocityState: "ZERO",
      lastSaleDate: null,
    });
  });
  it("rolls back the input manifest when materialization fails, retaining earlier versions", async () => {
    const before = (
      await pg.query(
        `SELECT count(*)::int n FROM "MerchandisingConfig" WHERE key LIKE 'calculation:sku-daily:%'`,
      )
    ).rows;
    await pg.exec(
      `UPDATE "InventorySnapshot" SET quantity=15 WHERE id='snapshot:2026-10-25'`,
    );
    const failDb: SqlDatabase = {
      ...db,
      $transaction: (cb) =>
        db.$transaction((tx) =>
          cb({
            ...tx,
            $executeRaw: async (q) => {
              if (q.text.includes('INSERT INTO "SkuDaily"'))
                throw new Error("materialization unavailable");
              return tx.$executeRaw(q);
            },
          }),
        ),
    };
    await expect(calculateSkuDaily("a", args, failDb)).rejects.toThrow(
      "materialization unavailable",
    );
    expect(
      (
        await pg.query(
          `SELECT count(*)::int n FROM "MerchandisingConfig" WHERE key LIKE 'calculation:sku-daily:%'`,
        )
      ).rows,
    ).toEqual(before);
    await pg.exec(
      `UPDATE "InventorySnapshot" SET quantity=14 WHERE id='snapshot:2026-10-25'`,
    );
  });
  it("freezes old classifications and ownership while current policy creates another result", async () => {
    await pg.exec(
      `UPDATE "Category" SET "seasonMonths"=ARRAY[1,2,3,4,5,6,7,8,9,10,11,12] WHERE id='category'`,
    );
    const original = await calculateSkuDaily("a", args, db);
    const old = await readSkuDaily("a", original.calculationId, query, db);
    await pg.exec(
      `UPDATE "Brand" SET ownership='CONSIGNMENT' WHERE id='brand'`,
    );
    const changed = await calculateSkuDaily("a", args, db);
    expect(changed.calculationId).not.toBe(original.calculationId);
    expect(
      (await readSkuDaily("a", changed.calculationId, query, db)).rows[0],
    ).toMatchObject({
      ownership: "CONSIGNMENT",
      classification: "DEAD",
      recommendation: "DISCUSS_SUPPLIER_RETURN",
    });
    expect(await readSkuDaily("a", original.calculationId, query, db)).toEqual(
      old,
    );
  });
  it("retains version 1 manifests and rows while enforcing status consistency for version 2", async () => {
    const latest = await calculateSkuDaily("a", args, db);
    await expect(
      pg.exec(
        `UPDATE "SkuDaily" SET classification=NULL WHERE "calculationVersion"=2`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pg.exec(
        `UPDATE "SkuDaily" SET classification='OTHER' WHERE "calculationVersion"=2`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pg.exec(
        `UPDATE "SkuDaily" SET classification='SERVICE' WHERE "calculationVersion"=2`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await pg.query(
      `INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive") VALUES ('v1','a','GENERAL','calculation:sku-daily:legacy',1,$1,false)`,
      [
        JSON.stringify({
          kind: "SKU_DAILY_INPUTS_V1",
          calculation: {
            ...latest,
            calculationId: "v1",
            calculationVersion: 1,
          },
        }),
      ],
    );
    await pg.exec(
      `INSERT INTO "SkuDaily" (id,"tenantId","skuId","businessDate","configId","calculationVersion","inputProvenance",metrics) VALUES ('v1-row','a','sku','2026-10-25','v1',1,'{}','{"sku":"SKU","name":"Legacy"}')`,
    );
    expect(await readSkuDaily("a", "v1", query, db)).toMatchObject({
      calculationVersion: 1,
      rows: [{ sku: "SKU", name: "Legacy" }],
    });
  });
  it("rejects invalid persisted metric shapes and does not write activation/ownership policy", async () => {
    await expect(
      pg.exec(`UPDATE "SkuDaily" SET "daysToZero"=-1`),
    ).rejects.toThrow();
    await expect(
      pg.exec(`UPDATE "SkuDaily" SET metrics='[]'`),
    ).rejects.toThrow();
    expect(
      (
        await pg.query(
          `SELECT count(*)::int n FROM "MerchandisingConfig" WHERE key LIKE 'calculation:sku-daily:%' AND "isActive"`,
        )
      ).rows,
    ).toEqual([{ n: 0 }]);
  });
});
