import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migrationName = "20261023000000_merchandising_data_model";
const migrationPath = new URL(`../../prisma/migrations/${migrationName}/migration.sql`, import.meta.url);
const rollbackPath = new URL("../../prisma/verification/28-rollback.sql", import.meta.url);
let db: PGlite;
let migration: string;

async function legacyDatabase() {
  const connection = new PGlite();
  const root = new URL("../../prisma/migrations/", import.meta.url);
  const directories = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name < migrationName)
    .map((entry) => entry.name).sort();
  for (const directory of directories) {
    await connection.exec(await readFile(new URL(`${directory}/migration.sql`, root), "utf8"));
  }
  return connection;
}

async function seedLegacy(connection: PGlite) {
  await connection.exec(`
    INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES
      ('a','A','a',now()), ('b','B','b',now());
    INSERT INTO "User" (id,email,"passwordHash",name,"tenantId","updatedAt") VALUES
      ('user-a','a@example.test','test','A','a',now()), ('user-b','b@example.test','test','B','b',now());
    INSERT INTO "Brand" (id,"tenantId",name) VALUES ('brand-a','a','Brand'), ('brand-b','b','Brand');
    INSERT INTO "Sku" (id,"tenantId","brandId",sku,name,category,"priceRetail","pricePurchase") VALUES
      ('sku-a','a','brand-a','SAME-SKU','A','Apparel',123.45,54.32),
      ('sku-b','b','brand-b','SAME-SKU','B','Apparel',123.45,54.32);
    INSERT INTO "SalesRecord" (id,"tenantId","skuId",date,"qtySold",revenue) VALUES ('sale-a','a','sku-a','2026-09-01',2,246.90);
    INSERT INTO "InventorySnapshot" (id,"tenantId","skuId","qtyOnHand","snapshotDate") VALUES ('stock-a','a','sku-a',10,'2026-09-01');
    INSERT INTO "CatalogUpload" (id,"tenantId","brandId",season) VALUES ('catalog-a','a','brand-a','SS26');
    INSERT INTO "CatalogItem" (id,"tenantId","brandId","catalogId",sku,name,category,"priceWholesale") VALUES
      ('item-a','a','brand-a','catalog-a','SAME-SKU','A','Apparel',54.32);
    INSERT INTO "DataSource" (id,"tenantId","driveFileId","updatedAt") VALUES
      ('sheets-a','a','sheet',now()), ('sheets-b','b','sheet',now());
    INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES
      ('sheets-run-a','a','sheets-a','MANUAL','SUCCESS','sheet-run','2026-09-01',now()),
      ('sheets-run-b','b','sheets-b','MANUAL','SUCCESS','sheet-run','2026-09-01',now());
    UPDATE "DataSource" SET "activeImportRunId"='sheets-run-a' WHERE id='sheets-a';
  `);
}

async function seedMerchandising() {
  await db.exec(`
    INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES
      ('api-a','a','SALESDRIVE','account',now()), ('api-b','b','SALESDRIVE','account',now()),
      ('api-a2','a','SALESDRIVE','other-account',now());
    INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES
      ('run-a','a','api-a','MANUAL','SUCCESS','api-run','2026-10-23',now()),
      ('retry-a','a','api-a','MANUAL','SUCCESS','api-retry','2026-10-23',now()),
      ('run-b','b','api-b','MANUAL','SUCCESS','api-run','2026-10-23',now()),
      ('run-a2','a','api-a2','MANUAL','SUCCESS','api-other','2026-10-23',now()),
      ('failed-a','a','api-a','MANUAL','FAILED','api-failed','2026-10-23',now());
    INSERT INTO "Category" (id,"tenantId",key,name,"updatedAt") VALUES
      ('category-a','a','apparel','Apparel',now()), ('category-b','b','apparel','Apparel',now());
    INSERT INTO "Supplier" (id,"tenantId",key,name,"updatedAt") VALUES
      ('supplier-a','a','supplier','Supplier',now()), ('supplier-b','b','supplier','Supplier',now());
    INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",revision,values,"approvedById","approvedAt","approvalReference") VALUES
      ('config-a','a','GENERAL',1,'{}','user-a',now(),'issue-27'),
      ('config-b','b','GENERAL',1,'{}','user-b',now(),'issue-27');
  `);
}

// Expected constraint failures must not poison the surrounding test transaction.
async function rejects(sql: string, code = "23503") {
  await db.exec("SAVEPOINT expected_failure");
  await expect(db.exec(sql)).rejects.toMatchObject({ code });
  await db.exec("ROLLBACK TO SAVEPOINT expected_failure; RELEASE SAVEPOINT expected_failure");
}

describe("merchandising migration on PostgreSQL", () => {
  beforeAll(async () => {
    migration = await readFile(migrationPath, "utf8");
    db = await legacyDatabase();
    await seedLegacy(db);
    await db.exec(migration);
  }, 30_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => { await db.exec("BEGIN"); });
  afterEach(async () => { await db.exec("ROLLBACK"); });

  it("preserves existing amounts, defaults and the active Sheets import without fabricating evidence", async () => {
    expect((await db.query('SELECT "priceRetail", "pricePurchase", "ownershipOverride", "firstReceiptAt", "productKind" FROM "Sku" WHERE id=\'sku-a\'')).rows)
      .toEqual([{ priceRetail: 123.45, pricePurchase: 54.32, ownershipOverride: null, firstReceiptAt: null, productKind: "UNKNOWN" }]);
    expect((await db.query('SELECT revenue FROM "SalesRecord"')).rows).toEqual([{ revenue: 246.9 }]);
    expect((await db.query('SELECT ownership,"commissionRate","leadTimeDays" FROM "Brand" WHERE id=\'brand-a\'')).rows)
      .toEqual([{ ownership: "UNKNOWN", commissionRate: null, leadTimeDays: 14 }]);
    expect((await db.query('SELECT "observedAt","costPrice","inTransitVerifiedAt","qtyInTransit" FROM "InventorySnapshot"')).rows)
      .toEqual([{ observedAt: null, costPrice: null, inTransitVerifiedAt: null, qtyInTransit: 0 }]);
    expect((await db.query('SELECT kind,"activeImportRunId" FROM "DataSource" WHERE id=\'sheets-a\'')).rows)
      .toEqual([{ kind: "GOOGLE_SHEETS", activeImportRunId: "sheets-run-a" }]);
  });

  it("rejects cross-tenant links on existing product, sales, inventory and catalog relations", async () => {
    await rejects('UPDATE "Sku" SET "brandId"=\'brand-b\' WHERE id=\'sku-a\'');
    await rejects('UPDATE "SalesRecord" SET "skuId"=\'sku-b\' WHERE id=\'sale-a\'');
    await rejects('UPDATE "InventorySnapshot" SET "skuId"=\'sku-b\' WHERE id=\'stock-a\'');
    await rejects('UPDATE "CatalogUpload" SET "brandId"=\'brand-b\' WHERE id=\'catalog-a\'');
    await rejects('UPDATE "CatalogItem" SET "brandId"=\'brand-b\' WHERE id=\'item-a\'');
    await db.exec('INSERT INTO "Brand" (id,"tenantId",name) VALUES (\'another-brand-a\',\'a\',\'Another\')');
    await rejects('UPDATE "CatalogItem" SET "brandId"=\'another-brand-a\' WHERE id=\'item-a\'');
  });

  it("keeps brand deletion compatible when SKUs are detached in the same transaction", async () => {
    await db.exec(`UPDATE "Sku" SET "brandId"=NULL WHERE "tenantId"='a' AND "brandId"='brand-a'; DELETE FROM "Brand" WHERE id='brand-a';`);
    expect((await db.query('SELECT id,"brandId" FROM "Sku" ORDER BY id')).rows)
      .toEqual([{ id: "sku-a", brandId: null }, { id: "sku-b", brandId: "brand-b" }]);
    expect((await db.query('SELECT count(*)::int AS n FROM "CatalogItem"')).rows).toEqual([{ n: 0 }]);
  });

  it("requires the active import to belong to the exact same source and tenant", async () => {
    await seedMerchandising();
    await rejects('UPDATE "DataSource" SET "activeImportRunId"=\'run-b\' WHERE id=\'api-a\'');
    await rejects('UPDATE "DataSource" SET "activeImportRunId"=\'run-a2\' WHERE id=\'api-a\'');
    await db.exec('UPDATE "DataSource" SET "activeImportRunId"=\'run-a\' WHERE id=\'api-a\'');
  });

  it("enforces category, supplier and SKU alias tenant scope while allowing identical external identities in other tenants", async () => {
    await seedMerchandising();
    await rejects('UPDATE "Sku" SET "categoryId"=\'category-b\' WHERE id=\'sku-a\'');
    await rejects('UPDATE "Sku" SET "supplierId"=\'supplier-b\' WHERE id=\'sku-a\'');
    await rejects('UPDATE "Brand" SET "supplierId"=\'supplier-b\' WHERE id=\'brand-a\'');
    const insertAlias = (id: string, tenant: string, sku: string, source: string, value = "123") =>
      `INSERT INTO "SkuAlias" (id,"tenantId","skuId","sourceId",type,value) VALUES ('${id}','${tenant}','${sku}','${source}','BARCODE','${value}')`;
    await db.exec(insertAlias("alias-a", "a", "sku-a", "api-a"));
    await db.exec(insertAlias("alias-b", "b", "sku-b", "api-b"));
    await rejects(insertAlias("duplicate", "a", "sku-a", "api-a"), "23505");
    await rejects(insertAlias("wrong-sku", "a", "sku-b", "api-a", "456"));
    await rejects(insertAlias("wrong-source", "a", "sku-a", "api-b"));
  });

  it("deduplicates normalized order events across imports and stores exact decimals with unknown cost", async () => {
    await seedMerchandising();
    const line = (id: string, tenant = "a", source = "api-a", run = "run-a", event = "current") => `
      INSERT INTO "OrderLine" (id,"tenantId","sourceId","importRunId","externalOrderId","externalLineId","eventKey","skuId",quantity,"netAmount","sourceRecordKey","observedAt","updatedAt")
      VALUES ('${id}','${tenant}','${source}','${run}','order-1','line-1','${event}','sku-${tenant}',2,0.1001,'orders/order-1',now(),now())`;
    await db.exec(line("line-a"));
    await rejects(line("reimport", "a", "api-a", "retry-a"), "23505");
    await db.exec(line("line-b", "b", "api-b", "run-b"));
    await db.exec(line("return-a", "a", "api-a", "retry-a", "refund-1"));
    await rejects(line("wrong-source", "a", "api-a", "run-a2", "other"));
    await rejects(line("wrong-tenant", "a", "api-a", "run-b", "other"));
    expect((await db.query('SELECT "netAmount"::text,"costAmount" FROM "OrderLine" WHERE id=\'line-a\'')).rows)
      .toEqual([{ netAmount: "0.1001", costAmount: null }]);
    await rejects('UPDATE "OrderLine" SET "skuId"=\'sku-b\' WHERE id=\'line-a\'');
    await rejects('DELETE FROM "DataImportRun" WHERE id=\'run-a\'');
  });

  it("retains raw payload revisions within the existing run lifecycle and validates source provenance", async () => {
    await seedMerchandising();
    const raw = (id: string, run: string) => `INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt")
      VALUES ('${id}','a','api-a','${run}','orders','order-1','{}','hash',now())`;
    await db.exec(raw("raw-a", "run-a"));
    await rejects(raw("duplicate", "run-a"), "23505");
    await db.exec(raw("revision", "retry-a"));
    await rejects(raw("other-source", "run-a2"));
    await rejects(raw("other-tenant", "run-b"));
  });

  it("deduplicates receipts and lines, keeps movement types separate and rejects foreign suppliers/SKUs", async () => {
    await seedMerchandising();
    await db.exec(`INSERT INTO "Receipt" (id,"tenantId","sourceId","importRunId","externalId","movementType","supplierId","observedAt","sourceRecordKey","updatedAt")
      VALUES ('receipt-a','a','api-a','run-a','receipt-1','TRANSFER','supplier-a',now(),'receipts/1',now());`);
    await rejects(`INSERT INTO "Receipt" (id,"tenantId","sourceId","importRunId","externalId","observedAt","sourceRecordKey","updatedAt")
      VALUES ('duplicate','a','api-a','retry-a','receipt-1',now(),'receipts/1',now())`, "23505");
    await rejects('UPDATE "Receipt" SET "supplierId"=\'supplier-b\' WHERE id=\'receipt-a\'');
    await rejects('UPDATE "Receipt" SET "importRunId"=\'run-a2\' WHERE id=\'receipt-a\'');
    await db.exec(`INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId","skuId",quantity) VALUES ('receipt-line','a','receipt-a','1','sku-a',1);`);
    await rejects('UPDATE "ReceiptLine" SET "skuId"=\'sku-b\' WHERE id=\'receipt-line\'');
    await rejects(`INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId",quantity) VALUES ('foreign-line','b','receipt-a','2',1)`);
    await rejects(`INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId",quantity) VALUES ('duplicate-line','a','receipt-a','1',1)`, "23505");
    expect((await db.query('SELECT "movementType","postingVerifiedAt","receivedAt" FROM "Receipt"')).rows)
      .toEqual([{ movementType: "TRANSFER", postingVerifiedAt: null, receivedAt: null }]);
  });

  it("deduplicates price history and daily snapshots without inventing historical timestamps", async () => {
    await seedMerchandising();
    const price = (id: string, run: string, revision = "revision-1") => `INSERT INTO "PriceHistory" (id,"tenantId","skuId","sourceId","importRunId","sourceRecordKey","observedAt","retailPrice")
      VALUES ('${id}','a','sku-a','api-a','${run}','${revision}','2026-10-23T00:00:00Z',123.4567)`;
    await db.exec(price("price-a", "run-a"));
    await rejects(price("duplicate", "retry-a"), "23505");
    await rejects(price("foreign-run", "run-b", "revision-2"));
    await db.exec(`UPDATE "InventorySnapshot" SET "sourceId"='api-a',"importRunId"='run-a',"observedAt"='2026-10-23T00:00:00Z',timezone='Europe/Kyiv',"sourceRecordKey"='stock/1',"costPrice"=42.1234 WHERE id='stock-a';`);
    await rejects('UPDATE "InventorySnapshot" SET "importRunId"=\'run-a2\' WHERE id=\'stock-a\'');
    await rejects('UPDATE "InventorySnapshot" SET "observedAt"=NULL WHERE id=\'stock-a\'', "23514");
    await rejects(`INSERT INTO "InventorySnapshot" (id,"tenantId","skuId","qtyOnHand","snapshotDate") VALUES ('duplicate','a','sku-a',20,'2026-09-01')`, "23505");
    expect((await db.query('SELECT "effectiveAt","retailPrice"::text FROM "PriceHistory"')).rows)
      .toEqual([{ effectiveAt: null, retailPrice: "123.4567" }]);
  });

  it("versions configuration and daily results; requires approval before activation and one active revision", async () => {
    await seedMerchandising();
    await db.exec(`UPDATE "MerchandisingConfig" SET "isActive"=true WHERE id='config-a';
      INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",revision,values) VALUES ('draft','a','GENERAL',2,'{}');`);
    await rejects('UPDATE "MerchandisingConfig" SET "isActive"=true WHERE id=\'draft\'', "23514");
    await rejects(`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",revision,values,"isActive","approvedById","approvedAt","approvalReference")
      VALUES ('second-active','a','GENERAL',3,'{}',true,'user-a',now(),'issue-27')`, "23505");
    await rejects('UPDATE "MerchandisingConfig" SET "approvedById"=\'user-b\' WHERE id=\'config-a\'');
    const daily = (id: string, config: string) => `INSERT INTO "SkuDaily" (id,"tenantId","skuId","businessDate","configId","calculationVersion","inputProvenance")
      VALUES ('${id}','a','sku-a','2026-10-23','${config}',1,'{"runs":["run-a"]}')`;
    await db.exec(daily("daily-a", "config-a"));
    await db.exec(daily("daily-draft", "draft"));
    await rejects(daily("duplicate", "config-a"), "23505");
    await rejects(daily("foreign-config", "config-b"));
    await rejects('UPDATE "SkuDaily" SET "skuId"=\'sku-b\' WHERE id=\'daily-a\'');
  });

  it("requires successful same-source checkpoints and tenant-scoped audit actors", async () => {
    await seedMerchandising();
    await db.exec(`INSERT INTO "SyncCursor" (id,"tenantId","sourceId",resource,checkpoint,"lastSuccessfulRunId","updatedAt")
      VALUES ('cursor','a','api-a','orders','{}','run-a',now());`);
    await rejects('UPDATE "SyncCursor" SET "lastSuccessfulRunId"=\'failed-a\' WHERE id=\'cursor\'', "23514");
    await rejects('UPDATE "SyncCursor" SET "lastSuccessfulRunId"=\'run-a2\' WHERE id=\'cursor\'', "23514");
    await rejects('UPDATE "SyncCursor" SET "lastSuccessfulRunId"=\'run-b\' WHERE id=\'cursor\'', "23514");
    await db.exec(`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","idempotencyKey")
      VALUES ('action','a','user-a','config-a','approve','config','approval-1');`);
    await rejects('UPDATE "MerchandisingAction" SET "actorId"=\'user-b\' WHERE id=\'action\'');
    await rejects('UPDATE "MerchandisingAction" SET "configId"=\'config-b\' WHERE id=\'action\'');
  });

  it("rejects invalid commission units, months, terms and source identities", async () => {
    await seedMerchandising();
    await rejects('UPDATE "Brand" SET "commissionRate"=1.1 WHERE id=\'brand-a\'', "23514");
    await rejects('UPDATE "Sku" SET "commissionRateOverride"=-0.1 WHERE id=\'sku-a\'', "23514");
    await rejects('UPDATE "Category" SET "seasonMonths"=ARRAY[0,13] WHERE id=\'category-a\'', "23514");
    await rejects('UPDATE "Category" SET "seasonMonths"=NULL WHERE id=\'category-a\'', "23514");
    await rejects('UPDATE "Supplier" SET moq=0 WHERE id=\'supplier-a\'', "23514");
    await rejects('UPDATE "DataSource" SET "sourceKey"=NULL WHERE id=\'api-a\'', "23514");
    await rejects('UPDATE "DataSource" SET "driveFileId"=\'sheet\' WHERE id=\'api-a\'', "23514");
  });

  it.each(["SALESDRIVE", "YML"])("prevents a %s source from claiming a configured Sheets file", async (kind) => {
    await rejects(`INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","driveFileId","updatedAt")
      VALUES ('wrong-kind','a','${kind}','account','sheet',now())`, "23514");
    await rejects(`UPDATE "DataSource" SET kind='${kind}',"sourceKey"='account' WHERE id='sheets-a'`, "23514");
    expect((await db.query('SELECT kind,"driveFileId" FROM "DataSource" WHERE id=\'sheets-a\'')).rows)
      .toEqual([{ kind: "GOOGLE_SHEETS", driveFileId: "sheet" }]);
  });

  it("supports whole-tenant deletion through the composite relation graph", async () => {
    await seedMerchandising();
    await db.exec(`UPDATE "DataSource" SET "activeImportRunId"='run-a' WHERE id='api-a';
      INSERT INTO "SyncCursor" (id,"tenantId","sourceId",resource,checkpoint,"lastSuccessfulRunId","updatedAt") VALUES ('cursor','a','api-a','orders','{}','run-a',now());
      DELETE FROM "Tenant" WHERE id='a';`);
    expect((await db.query('SELECT id FROM "Sku"')).rows).toEqual([{ id: "sku-b" }]);
    expect((await db.query('SELECT id FROM "Tenant"')).rows).toEqual([{ id: "b" }]);
  });
});

describe("migration failure and rollback", () => {
  it("aborts inconsistent legacy data atomically, preserving the original schema and records", async () => {
    const connection = await legacyDatabase();
    try {
      await seedLegacy(connection);
      await connection.exec('UPDATE "Sku" SET "brandId"=\'brand-b\' WHERE id=\'sku-a\'');
      await expect(connection.exec(migration)).rejects.toThrow(/preflight/);
      await connection.exec("ROLLBACK");
      expect((await connection.query("SELECT to_regclass('\"Category\"') AS relation")).rows).toEqual([{ relation: null }]);
      expect((await connection.query('SELECT "brandId","priceRetail" FROM "Sku" WHERE id=\'sku-a\'')).rows)
        .toEqual([{ brandId: "brand-b", priceRetail: 123.45 }]);
    } finally { await connection.close(); }
  }, 30_000);

  it("rolls back an unused expansion without losing legacy data and allows reapplication", async () => {
    const connection = await legacyDatabase();
    try {
      await seedLegacy(connection);
      await connection.exec(migration);
      await connection.exec(await readFile(rollbackPath, "utf8"));
      expect((await connection.query("SELECT to_regclass('\"OrderLine\"') AS relation")).rows).toEqual([{ relation: null }]);
      expect((await connection.query('SELECT revenue FROM "SalesRecord"')).rows).toEqual([{ revenue: 246.9 }]);
      expect((await connection.query('SELECT "activeImportRunId" FROM "DataSource" WHERE id=\'sheets-a\'')).rows)
        .toEqual([{ activeImportRunId: "sheets-run-a" }]);
      await connection.exec(migration);
    } finally { await connection.close(); }
  }, 30_000);

  it("refuses destructive rollback after new data or metadata has been written", async () => {
    const connection = await legacyDatabase();
    try {
      await seedLegacy(connection);
      await connection.exec(migration);
      await connection.exec('UPDATE "Sku" SET "barcode"=\'123\' WHERE id=\'sku-a\'');
      const rollback = await readFile(rollbackPath, "utf8");
      await expect(connection.exec(rollback)).rejects.toThrow(/Rollback refused/);
      await connection.exec("ROLLBACK");
      await connection.exec(`UPDATE "Sku" SET barcode=NULL WHERE id='sku-a';
        INSERT INTO "Category" (id,"tenantId",key,name,"updatedAt") VALUES ('category','a','apparel','Apparel',now());`);
      await expect(connection.exec(rollback)).rejects.toThrow(/Rollback refused/);
      await connection.exec("ROLLBACK");
    } finally { await connection.close(); }
  }, 30_000);
});
