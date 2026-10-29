import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { Prisma } from "@prisma/client";
import { createMerchandisingDb } from "../helpers/merchandising-db";
import { input, mapping } from "../helpers/sheets-mapping";
import {
  previewSheetsMapping,
  approveSheetsMapping,
} from "@/lib/connectors/sheets-mapping-store";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import {
  parseScreenQuery,
  SCREEN_NAMES,
} from "@/lib/merchandising-screen-query";
import { processConnectorRecalculation } from "@/lib/connectors/recalculation";
import {
  projectSheetsImport,
  readSheetsProjectionIntent,
} from "@/lib/connectors/sheets-projection-store";
import {
  selectConnectorSource,
  listConnectorSources,
} from "@/lib/connectors/source";
import type { SheetsFieldMapping } from "@/lib/sheets-mapping-contract";
import type { SqlDatabase } from "@/lib/connectors/database";
let f: Awaited<ReturnType<typeof createMerchandisingDb>>;
const principal = { tenantId: "a", userId: "owner" };
const product = {
  col_a: "p",
  col_b: "sku",
  col_c: "Product",
  col_e: "Watches",
  col_g: "20.0001",
  col_h: "4.0001",
  col_i: 4,
  col_j: 2,
};
const order = {
  col_a: "o",
  col_b: "line",
  col_c: "p",
  col_d: "sku",
  col_e: 5,
  col_f: 1,
  col_h: "2026-10-20",
  col_k: 3,
  col_l: "10.0001",
  col_m: "4.0001",
};
const put = async (id: string, snapshot: string, data: unknown, row = 2) =>
  f.pg.query(
    `INSERT INTO "DataSheetRow" (id,"tenantId","snapshotId","rowNumber",data,"rowHash") VALUES ($1,'a',$2,$3,$4,$1)`,
    [id, snapshot, row, JSON.stringify(data)],
  );
async function approved(config = mapping()) {
  const preview = await previewSheetsMapping(
    principal,
    "sheet",
    { expectedRevision: 0, importRunId: "run", mapping: config },
    f.db,
  );
  await approveSheetsMapping(
    principal,
    "sheet",
    {
      configId: preview.configId,
      previewHash: preview.previewHash,
      reference: "Synthetic approved mapping",
    },
    f.db,
  );
  await selectConnectorSource("a", "owner", "sheet", 0, f.db);
  return {
    importRunId: "run",
    mappingId: preview.configId,
    selectionRevision: 1,
  };
}
beforeAll(async () => {
  f = await createMerchandisingDb();
}, 30000);
afterAll(async () => f?.pg.close());
beforeEach(async () => {
  await f.pg.exec(
    `TRUNCATE "Tenant" CASCADE;INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now()),('b','B','b',now());INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('owner','owner@projection.test','test','Owner','ADMIN','a',now()),('analyst','analyst@projection.test','test','Analyst','ANALYST','a',now()),('foreign','foreign@projection.test','test','Foreign','ADMIN','b',now());INSERT INTO "DataSource" (id,"tenantId",kind,"driveFileId","updatedAt") VALUES ('sheet','a','GOOGLE_SHEETS','file',now());INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","sourceChecksum",stats,"createdAt","updatedAt") VALUES ('run','a','sheet','MANUAL','WARNING','fixture',current_date,'checksum','{"rawLegacyCount":42}','2026-10-29T10:00:00Z',now());UPDATE "DataSource" SET "activeImportRunId"='run' WHERE id='sheet';`,
  );
  for (const s of input.sheets)
    await f.pg.query(
      `INSERT INTO "DataSheetSnapshot" (id,"tenantId","importRunId","sheetKey","sourceName","headerRow",columns,"rowCount",checksum) VALUES ($1,'a','run',$2,$3,1,$4,1,$5)`,
      [s.id, s.sheetKey, s.sourceName, JSON.stringify(s.columns), s.checksum],
    );
  await put("product", "products", product);
  await put("order", "orders", order);
});
it("requires approved mapping and explicit source selection before preparing any canonical facts", async () => {
  await expect(
    projectSheetsImport(
      principal,
      "sheet",
      { importRunId: "run", mappingId: "none", selectionRevision: 0 },
      f.db,
    ),
  ).rejects.toMatchObject({ code: "SHEETS_SOURCE_SELECTION_REQUIRED" });
  const request = await approved();
  await expect(
    projectSheetsImport(
      { tenantId: "a", userId: "analyst" },
      "sheet",
      request,
      f.db,
    ),
  ).rejects.toMatchObject({ code: "AI_FORBIDDEN" });
  await expect(
    projectSheetsImport(
      { tenantId: "b", userId: "foreign" },
      "sheet",
      request,
      f.db,
    ),
  ).rejects.toMatchObject({ code: "SHEETS_RAW_IMPORT_REQUIRED" });
  expect((await f.pg.query(`SELECT count(*)::int n FROM "Sku"`)).rows).toEqual([
    { n: 0 },
  ]);
});
it("publishes exact line totals without fabricating historical stock, receipts or history coverage", async () => {
  const request = await approved(),
    result = await projectSheetsImport(principal, "sheet", request, f.db);
  expect(result).toMatchObject({
    outcome: "projected",
    stats: { orderLines: 1, snapshots: 0 },
  });
  expect(
    (
      await f.pg.query(
        `SELECT quantity::text,"signedRevenue"::text,"signedCost"::text,"sourceAmounts","skuId" IS NOT NULL matched FROM "OrderLine"`,
      )
    ).rows,
  ).toEqual([
    expect.objectContaining({
      quantity: "3.0000",
      signedRevenue: "10.0001",
      signedCost: "4.0001",
      matched: true,
      sourceAmounts: expect.objectContaining({
        netLineAmount: "10.0001",
        costLineAmount: "4.0001",
        unitPrice: null,
      }),
    }),
  ]);
  expect(
    (
      await f.pg.query(
        `SELECT stats->>'rawLegacyCount' retained FROM "DataImportRun"`,
      )
    ).rows,
  ).toEqual([{ retained: "42" }]);
  expect(
    (
      await f.pg.query(
        `SELECT checkpoint->>'historyComplete' complete FROM "ConnectorSyncJob"`,
      )
    ).rows,
  ).toEqual([{ complete: "false" }]);
  expect((await listConnectorSources("a", f.db)).connections[0]).toMatchObject({
    readiness: "READY",
  });
  expect((await f.pg.query(`SELECT "productKind" FROM "Sku"`)).rows).toEqual([
    { productKind: "MERCHANDISE" },
  ]);
  expect(
    (await f.pg.query(`SELECT count(*)::int n FROM "Receipt"`)).rows,
  ).toEqual([{ n: 0 }]);
});
it("is idempotent across response loss without duplicate records, facts or approval audit", async () => {
  const request = await approved();
  await projectSheetsImport(principal, "sheet", request, f.db);
  expect(
    await projectSheetsImport(principal, "sheet", request, f.db),
  ).toMatchObject({ outcome: "duplicate" });
  expect(
    (await f.pg.query(`SELECT count(*)::int n FROM "OrderLine"`)).rows,
  ).toEqual([{ n: 1 }]);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "MerchandisingAction" WHERE action='SHEETS_PROJECTED'`,
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
});
it("records approved current stock, catalog cost provenance and independently known in-transit values", async () => {
  const config = mapping();
  config.policy.stockObservation = "import_observation";
  config.policy.stockReference = "Owner confirms current export";
  await projectSheetsImport(principal, "sheet", await approved(config), f.db);
  const [snapshot] = (
    await f.pg.query(
      `SELECT quantity::text,"costPrice"::text,"costValue"::text,"qtyInTransit","inTransitVerifiedAt" IS NOT NULL verified,"costProvenance",diagnostics FROM "InventorySnapshot"`,
    )
  ).rows;
  expect(snapshot).toMatchObject({
    quantity: "4.0000",
    costPrice: "4.0001",
    costValue: "16.0004",
    qtyInTransit: 2,
    verified: true,
    costProvenance: expect.objectContaining({ type: "mapped_catalog" }),
    diagnostics: expect.objectContaining({ historicalStockAvailable: false }),
  });
});
it("does not publish an inventory observation when a mapped timestamp is invalid or in the future", async () => {
  const config = mapping();
  config.policy.stockObservation = "column";
  config.policy.stockReference = "Synthetic dated observations";
  await projectSheetsImport(principal, "sheet", await approved(config), f.db);
  expect(
    (await f.pg.query(`SELECT count(*)::int n FROM "InventorySnapshot"`)).rows,
  ).toEqual([{ n: 0 }]);
});
it("preserves every line of a multi-line order instead of replacing it row by row", async () => {
  await put(
    "product-2",
    "products",
    { ...product, col_a: "p2", col_b: "sku2" },
    3,
  );
  await put(
    "order-2",
    "orders",
    { ...order, col_b: "line2", col_c: "p2", col_d: "sku2", col_l: "1.0001" },
    3,
  );
  await f.pg.exec(`UPDATE "DataSheetSnapshot" SET "rowCount"=2`);
  await projectSheetsImport(principal, "sheet", await approved(), f.db);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n,sum("signedRevenue")::text total FROM "OrderLine"`,
      )
    ).rows,
  ).toEqual([{ n: 2, total: "11.0002" }]);
});
it("quarantines the entire ambiguous order and retains its original raw snapshot", async () => {
  await put("duplicate-line", "orders", { ...order }, 3);
  await f.pg.exec(
    `UPDATE "DataSheetSnapshot" SET "rowCount"=2 WHERE id='orders'`,
  );
  const result = await projectSheetsImport(
    principal,
    "sheet",
    await approved(),
    f.db,
  );
  expect(result).toMatchObject({
    stats: { orders: 0, quarantined: 1, quarantinedRows: 2 },
  });
  expect(
    (await f.pg.query(`SELECT count(*)::int n FROM "OrderLine"`)).rows,
  ).toEqual([{ n: 0 }]);
  expect(
    (await f.pg.query(`SELECT count(*)::int n FROM "DataSheetRow"`)).rows,
  ).toEqual([{ n: 3 }]);
});
it("rechecks source/import/selection fences after preparation and publishes nothing on mismatch", async () => {
  const request = await approved();
  let calls = 0;
  const db: SqlDatabase = {
    ...f.db,
    $transaction: async (cb, opts) => {
      if (++calls === 2)
        await f.pg.exec(
          `UPDATE "DataImportRun" SET "sourceChecksum"='changed' WHERE id='run'`,
        );
      return f.db.$transaction(cb, opts);
    },
  };
  await expect(
    projectSheetsImport(principal, "sheet", request, db),
  ).rejects.toMatchObject({ code: "SHEETS_PROJECTION_CHANGED" });
  expect((await f.pg.query(`SELECT count(*)::int n FROM "Sku"`)).rows).toEqual([
    { n: 0 },
  ]);
  await expect(
    projectSheetsImport(
      principal,
      "sheet",
      { ...request, selectionRevision: 2 },
      f.db,
    ),
  ).rejects.toMatchObject({ code: "SHEETS_PROJECTION_CHANGED" });
});
it("rolls back catalog, orders, readiness and audit if publication fails after catalog writes", async () => {
  const request = await approved();
  const db: SqlDatabase = {
    ...f.db,
    $transaction: (cb, opts) =>
      f.db.$transaction(
        (tx) =>
          cb({
            ...tx,
            $executeRaw: (q) => {
              if (q.text.includes('INSERT INTO "OrderLine"'))
                throw Error("synthetic failure");
              return tx.$executeRaw(q);
            },
          }),
        opts,
      ),
  };
  await expect(
    projectSheetsImport(principal, "sheet", request, db),
  ).rejects.toThrow("synthetic failure");
  expect((await f.pg.query(`SELECT count(*)::int n FROM "Sku"`)).rows).toEqual([
    { n: 0 },
  ]);
  expect((await listConnectorSources("a", f.db)).connections[0]).toMatchObject({
    readiness: "IMPORT_REQUIRED",
  });
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "MerchandisingAction" WHERE action='SHEETS_PROJECTED'`,
      )
    ).rows,
  ).toEqual([{ n: 0 }]);
});

it("reprojects the same raw observation under a newer approved mapping without retaining revoked in-transit evidence", async () => {
  const first = mapping();
  first.policy.stockObservation = "import_observation";
  first.policy.stockReference = "Synthetic current export";
  await projectSheetsImport(principal, "sheet", await approved(first), f.db);
  const second = mapping();
  second.policy.stockObservation = "import_observation";
  second.policy.stockReference = "Synthetic reviewed export";
  second.products.inTransit = null;
  second.products.retailPrice = "col_h";
  const preview = await previewSheetsMapping(
    principal,
    "sheet",
    { expectedRevision: 1, importRunId: "run", mapping: second },
    f.db,
  );
  await approveSheetsMapping(
    principal,
    "sheet",
    {
      configId: preview.configId,
      previewHash: preview.previewHash,
      reference: "Synthetic revised mapping",
    },
    f.db,
  );
  await projectSheetsImport(
    principal,
    "sheet",
    { importRunId: "run", mappingId: preview.configId, selectionRevision: 1 },
    f.db,
  );
  expect(
    (
      await f.pg.query(
        `SELECT "qtyInTransit","inTransitVerifiedAt","retailPrice"::text FROM "InventorySnapshot"`,
      )
    ).rows,
  ).toEqual([
    { qtyInTransit: 0, inTransitVerifiedAt: null, retailPrice: "4.0001" },
  ]);
  expect(
    (await f.pg.query(`SELECT count(*)::int n FROM "PriceHistory"`)).rows,
  ).toEqual([{ n: 1 }]);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "MerchandisingAction" WHERE action='SHEETS_PROJECTED'`,
      )
    ).rows,
  ).toEqual([{ n: 2 }]);
});
it("fully replaces the current order observation while retaining older raw facts and historical stock", async () => {
  const m = mapping();
  m.policy.stockObservation = "import_observation";
  m.policy.stockReference = "Synthetic snapshot";
  const first = await approved(m);
  await projectSheetsImport(principal, "sheet", first, f.db);
  await f.pg.exec(
    `INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","sourceChecksum","createdAt","updatedAt") VALUES ('run2','a','sheet','MANUAL','WARNING','fixture-2',current_date,'next-checksum','2026-10-30T10:00:00Z',now());INSERT INTO "DataSheetSnapshot" (id,"tenantId","importRunId","sheetKey","sourceName","headerRow",columns,"rowCount",checksum) SELECT id||'-2',"tenantId",'run2',"sheetKey","sourceName","headerRow",columns,CASE WHEN "sheetKey"='zavod_api' THEN 0 ELSE "rowCount" END,checksum FROM "DataSheetSnapshot" WHERE "importRunId"='run';INSERT INTO "DataSheetRow" (id,"tenantId","snapshotId","rowNumber",data,"rowHash") SELECT id||'-2',"tenantId","snapshotId"||'-2',"rowNumber",data,"rowHash" FROM "DataSheetRow" WHERE "snapshotId"='products';UPDATE "DataSource" SET "activeImportRunId"='run2' WHERE id='sheet'`,
  );
  await projectSheetsImport(
    principal,
    "sheet",
    { ...first, importRunId: "run2" },
    f.db,
  );
  expect(
    (await f.pg.query(`SELECT count(*)::int n FROM "OrderLine"`)).rows,
  ).toEqual([{ n: 0 }]);
  expect(
    (await f.pg.query(`SELECT count(*)::int n FROM "InventorySnapshot"`)).rows,
  ).toEqual([{ n: 2 }]);
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n FROM "DataSourceRecord" WHERE "importRunId"='run' AND resource='orders'`,
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
});
it("rolls back a replacement failure while retaining the previously published current facts", async () => {
  const request = await approved();
  await projectSheetsImport(principal, "sheet", request, f.db);
  await f.pg.exec(
    `UPDATE "DataImportRun" SET "sourceChecksum"='synthetic-replacement' WHERE id='run'`,
  );
  const db: SqlDatabase = {
    ...f.db,
    $transaction: (cb, opts) =>
      f.db.$transaction(
        (tx) =>
          cb({
            ...tx,
            $executeRaw: (q) => {
              if (q.text.includes('INSERT INTO "OrderLine"'))
                throw Error("replacement failure");
              return tx.$executeRaw(q);
            },
          }),
        opts,
      ),
  };
  await expect(
    projectSheetsImport(principal, "sheet", request, db),
  ).rejects.toThrow("replacement failure");
  expect(
    (await f.pg.query(`SELECT "signedRevenue"::text FROM "OrderLine"`)).rows,
  ).toEqual([{ signedRevenue: "10.0001" }]);
});
it("pages a larger frozen import and stages more than one order batch without losing rows", async () => {
  await f.pg.exec(
    `DELETE FROM "DataSheetRow";INSERT INTO "DataSheetRow" (id,"tenantId","snapshotId","rowNumber",data,"rowHash") SELECT 'p-'||i,'a','products',i+1,jsonb_build_object('col_a','product-'||i,'col_b','sku-'||i,'col_c','Product '||i,'col_e','Watches','col_g',20,'col_h',4,'col_i',1,'col_j',0),'p-'||i FROM generate_series(1,1201) i;INSERT INTO "DataSheetRow" (id,"tenantId","snapshotId","rowNumber",data,"rowHash") SELECT 'o-'||i,'a','orders',i+1,jsonb_build_object('col_a','order-'||i,'col_b','line-'||i,'col_c','product-'||i,'col_d','sku-'||i,'col_e',5,'col_f',1,'col_h','2026-10-20','col_k',3,'col_l','10.0001','col_m','4.0001'),'o-'||i FROM generate_series(1,1201) i;UPDATE "DataSheetSnapshot" SET "rowCount"=1201`,
  );
  const result = await projectSheetsImport(
    principal,
    "sheet",
    await approved(),
    f.db,
  );
  expect(result).toMatchObject({
    stats: { products: 1201, orders: 1201, orderLines: 1201 },
  });
  expect(
    (
      await f.pg.query(
        `SELECT count(*)::int n,sum("signedRevenue")::text total,count("skuId")::int matched FROM "OrderLine"`,
      )
    ).rows,
  ).toEqual([{ n: 1201, total: "12010.1201", matched: 1201 }]);
}, 30000);

it("preserves an existing manual product kind when the source default is unverified", async () => {
  await f.pg.exec(
    `INSERT INTO "Sku" (id,"tenantId",sku,name,category,"productKind") VALUES ('manual-sku','a','sku','Reviewed service','Services','SERVICE')`,
  );
  const m = mapping();
  m.policy.productKinds = {};
  await projectSheetsImport(principal, "sheet", await approved(m), f.db);
  expect(
    (await f.pg.query(`SELECT "productKind" FROM "Sku" WHERE id='manual-sku'`))
      .rows,
  ).toEqual([{ productKind: "SERVICE" }]);
});

it("does not mutate the approved mapping revision while publishing derived inputs", async () => {
  const request = await approved();
  const before = (
    await f.pg.query(`SELECT values FROM "MerchandisingConfig" WHERE id=$1`, [
      request.mappingId,
    ])
  ).rows;
  await projectSheetsImport(principal, "sheet", request, f.db);
  expect(
    (
      await f.pg.query(`SELECT values FROM "MerchandisingConfig" WHERE id=$1`, [
        request.mappingId,
      ])
    ).rows,
  ).toEqual(before);
});

it("loads all five MVP screens from the actual native Sheets projection without a connector row", async () => {
  await f.pg.exec(`UPDATE "DataImportRun" SET "completedAt"='2026-10-29T11:30:00Z' WHERE id='run'`);
  const request = await approved();
  expect(await readSheetsProjectionIntent(principal, "sheet", f.db)).toEqual({
    sourceId: "sheet",
    ...request,
  });
  await projectSheetsImport(principal, "sheet", request, f.db);
  const now = new Date("2026-10-29T12:00:00Z"),
    snapshot = await createScreenSnapshot(
      "a",
      { dateFrom: "2026-10-01", dateTo: "2026-10-28", asOf: "2026-10-29", now },
      f.db,
    );
  expect(snapshot.sourceId).toBe("sheet");
  expect(snapshot.sales.context.history.current).toBe(false);
  for (const screen of SCREEN_NAMES) {
    const q = parseScreenQuery(
      new URLSearchParams({ snapshotId: snapshot.snapshotId }),
      screen,
    );
    const result = await getMerchandisingScreen("a", screen, q, f.db, now);
    expect(result.context.sourceId).toBe("sheet");
    expect(result.context.snapshotId).toBe(snapshot.snapshotId);
    expect(result.freshness).toMatchObject({
      status: "FRESH", sourceStale: false, freshnessBasis: "SHEETS_IMPORT",
      sourceAgeSeconds: 1800, orderWatermark: null, orderAgeSeconds: null,
    });
    expect(Date.parse(result.freshness.sourceObservedAt!)).toBe(Date.parse("2026-10-29T11:30:00Z"));
    expect(snapshot.sales.context.history.current).toBe(false);
    if (screen === "overview") {
      expect(result.overview!.byCurrency[0]).toMatchObject({
        classificationCoverage: { state: "UNAVAILABLE", evaluatedSkuCount: 0, reviewSkuCount: 1 },
        deadShare: null, bottleneck: null,
      });
    }
  }
  const q = parseScreenQuery(new URLSearchParams({ snapshotId: snapshot.snapshotId }), "overview");
  const expired = await getMerchandisingScreen("a", "overview", q, f.db, new Date("2026-10-29T14:00:00Z"));
  expect(expired.freshness).toMatchObject({ status: "STALE", sourceStale: true, sourceAgeSeconds: 9000 });
  expect(expired.overview).toEqual((await getMerchandisingScreen("a", "overview", q, f.db, now)).overview);
  await f.pg.exec(`UPDATE "DataImportRun" SET "completedAt"=NULL WHERE id='run'`);
  const missingTime = await getMerchandisingScreen("a", "overview", q, f.db, now);
  expect(missingTime.freshness).toMatchObject({ status: "STALE", sourceAgeSeconds: null });
  await f.pg.exec(`UPDATE "DataImportRun" SET "completedAt"='2026-10-29T13:00:00Z' WHERE id='run'`);
  const futureTime = await getMerchandisingScreen("a", "overview", q, f.db, now);
  expect(futureTime.freshness).toMatchObject({ status: "STALE", sourceAgeSeconds: null });
  expect(
    (await f.pg.query(`SELECT count(*)::int n FROM "ConnectorConnection"`))
      .rows,
  ).toEqual([{ n: 0 }]);
  await f.pg.exec(
    `UPDATE "DataSource" SET "activeImportRunId"=NULL WHERE id='sheet'`,
  );
  const stale = await getMerchandisingScreen(
    "a",
    "overview",
    parseScreenQuery(
      new URLSearchParams({ snapshotId: snapshot.snapshotId }),
      "overview",
    ),
    f.db,
    now,
  );
  expect(stale.freshness.sourceChanged).toBe(true);
});
it("consumes native Sheets recalculation in two phases and resets it only for a changed projection", async () => {
  const request = await approved();
  await projectSheetsImport(principal, "sheet", request, f.db);
  expect(await processConnectorRecalculation("a", f.db)).toMatchObject({
    processed: true,
    phase: "DAILY",
    published: true,
  });
  expect(await processConnectorRecalculation("a", f.db)).toMatchObject({
    processed: true,
    phase: "SALES",
    published: true,
  });
  expect(await processConnectorRecalculation("a", f.db)).toMatchObject({
    processed: false,
  });
  await projectSheetsImport(principal, "sheet", request, f.db);
  expect(
    (await f.pg.query(`SELECT state FROM "ConnectorRecalculation"`)).rows,
  ).toEqual([{ state: "COMPLETE" }]);
  await f.pg.exec(
    `UPDATE "DataImportRun" SET "sourceChecksum"='new synthetic observation' WHERE id='run'`,
  );
  await projectSheetsImport(principal, "sheet", request, f.db);
  expect(
    (
      await f.pg.query(
        `SELECT state,"inputProvenance"->>'leaseToken' lease FROM "ConnectorRecalculation"`,
      )
    ).rows,
  ).toEqual([{ state: "WAITING_ENGINE", lease: null }]);
});
