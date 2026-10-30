import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createMerchandisingDb } from "../helpers/merchandising-db";
import { storeCatalog } from "@/lib/connectors/catalog-storage";
import type { CatalogSnapshot } from "@/lib/connectors/contract";
import { getProductQuality } from "@/lib/product-quality";

let f: Awaited<ReturnType<typeof createMerchandisingDb>>;
const scope = { tenantId: "a", sourceId: "sheet", importRunId: "first", timezone: "Europe/Kyiv", provider: "sheets" };
const catalog = (sku: string | null, day: string, price = "100"): CatalogSnapshot => ({
  observedAt: `${day}T12:00:00Z`, rawResponse: "synthetic",
  products: [{ externalId: "p", sku, name: "Product", brand: null, categoryId: null, barcode: null,
    retailPrice: price, costPrice: "40", currency: "UAH", observedAt: `${day}T12:00:00Z`, updatedAt: null, raw: {} }],
  stock: [{ externalId: "p", productId: "p", onHand: "2", inTransit: null, observedAt: `${day}T12:00:00Z`, updatedAt: null }],
});
beforeAll(async () => { f = await createMerchandisingDb(); }, 30000);
afterAll(async () => f?.pg.close());
beforeEach(async () => {
  await f.pg.exec(`TRUNCATE "Tenant" CASCADE;
    INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now());
    INSERT INTO "DataSource" (id,"tenantId",kind,"driveFileId","updatedAt") VALUES ('sheet','a','GOOGLE_SHEETS','file',now());
    INSERT INTO "ConnectorSelection" ("tenantId","sourceId") VALUES ('a','sheet');
    INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt")
      VALUES ('first','a','sheet','MANUAL','SUCCESS','first','2026-10-28',now()),('second','a','sheet','MANUAL','SUCCESS','second','2026-10-29',now());
    INSERT INTO "Sku" (id,"tenantId",sku,name,category) VALUES ('legacy','a','real-sku','Legacy product','Test');
    INSERT INTO "SalesRecord" (id,"tenantId","skuId",date,"qtySold",revenue) VALUES ('legacy-sale','a','legacy','2026-10-20',1,100);
    INSERT INTO "InventorySnapshot" (id,"tenantId","skuId","snapshotDate","qtyOnHand") VALUES ('legacy-stock','a','legacy','2026-10-28',7);`);
  await f.db.$transaction(tx => storeCatalog(tx, scope, catalog(null, "2026-10-28")));
});
const refresh = () => f.db.$transaction(tx => storeCatalog(tx, { ...scope, importRunId: "second" }, catalog("real-sku", "2026-10-29", "120")));
async function anchor() {
  return (await f.pg.query<{ id: string }>(`SELECT id FROM "Sku" WHERE sku='@sheets:sheet:p'`)).rows[0].id;
}

it("keeps the source identity and historical facts when a formerly unavailable SKU matches an unbound legacy row", async () => {
  const id = await anchor();
  await f.pg.query(`INSERT INTO "OrderLine" (id,"tenantId","sourceId","importRunId","externalOrderId","externalLineId","skuId",quantity,"sourceRecordKey","observedAt","updatedAt") VALUES ('history','a','sheet','first','o','l',$1,1,'fixture','2026-10-28',now())`, [id]);
  const result = await refresh();
  expect(result.issues).toContain("CATALOG_LEGACY_SKU_COLLISION");
  const quality = await getProductQuality("a", { code: "CATALOG_LEGACY_SKU_COLLISION" }, f.db);
  expect(quality.pagination.totalRows).toBe(1);
  expect(quality.rows[0]).toMatchObject({ id, sku: "@sheets:sheet:p", name: "Product", sourceId: "sheet", importRunId: "second" });
  expect(quality.rows[0].issues).toContain("CATALOG_LEGACY_SKU_COLLISION");
  expect(quality.summary).toContainEqual(expect.objectContaining({ code: "CATALOG_LEGACY_SKU_COLLISION", skuCount: 1 }));
  expect((await f.pg.query(`SELECT "skuId" FROM "SkuAlias" WHERE "sourceId"='sheet' AND value='real-sku'`)).rows).toEqual([{ skuId: id }]);
  expect((await f.pg.query(`SELECT "skuId" FROM "OrderLine" WHERE id='history'`)).rows).toEqual([{ skuId: id }]);
  expect((await f.pg.query(`SELECT "skuId",revenue FROM "SalesRecord" WHERE id='legacy-sale'`)).rows).toEqual([{ skuId: "legacy", revenue: 100 }]);
  expect((await f.pg.query(`SELECT "skuId","qtyOnHand","sourceId" FROM "InventorySnapshot" WHERE id='legacy-stock'`)).rows)
    .toEqual([{ skuId: "legacy", qtyOnHand: 7, sourceId: null }]);
  expect((await f.pg.query(`SELECT count(*)::int n FROM "Sku"`)).rows).toEqual([{ n: 2 }]);
  expect((await f.pg.query(`SELECT count(*)::int n FROM "InventorySnapshot" WHERE "skuId"=$1`, [id])).rows).toEqual([{ n: 2 }]);
  expect((await f.pg.query(`SELECT count(*)::int n FROM "PriceHistory" WHERE "skuId"=$1`, [id])).rows).toEqual([{ n: 2 }]);
  await refresh();
  expect((await f.pg.query(`SELECT count(*)::int n FROM "ImportIssue" WHERE code='CATALOG_LEGACY_SKU_COLLISION'`)).rows).toEqual([{ n: 1 }]);
  expect((await f.pg.query(`SELECT count(*)::int n FROM "InventorySnapshot" WHERE "skuId"=$1`, [id])).rows).toEqual([{ n: 2 }]);
  expect((await f.pg.query(`SELECT count(*)::int n FROM "PriceHistory" WHERE "skuId"=$1`, [id])).rows).toEqual([{ n: 2 }]);
});

it("does not expose an old collision warning as a current product issue", async () => {
  await refresh();
  await f.pg.exec(`UPDATE "ImportIssue" SET "importRunId"='first' WHERE code='CATALOG_LEGACY_SKU_COLLISION'`);
  const quality = await getProductQuality("a", { code: "CATALOG_LEGACY_SKU_COLLISION" }, f.db);
  expect(quality.rows).toEqual([]);
  expect(quality.pagination.totalRows).toBe(0);
  expect(quality.summary.some(row => row.code === "CATALOG_LEGACY_SKU_COLLISION")).toBe(false);
});

it("shows the current catalogue warning even when the latest stock observation belongs to an older import", async () => {
  await f.db.$transaction(tx => storeCatalog(tx, { ...scope, importRunId: "second" }, catalog("real-sku", "2026-10-29"), { stockObserved: false }));
  const quality = await getProductQuality("a", { code: "CATALOG_LEGACY_SKU_COLLISION" }, f.db);
  expect(quality.pagination.totalRows).toBe(1);
  expect(quality.rows[0].id).toBe(await anchor());
  expect(quality.rows[0].issues).toContain("CATALOG_LEGACY_SKU_COLLISION");
});

it.each(["alias", "other-source", "order", "receipt", "price", "stock", "provenance"])(
  "keeps a conflicting %s-bound identity blocked and rolls back the new observation", async binding => {
    if (binding === "alias") await f.pg.exec(`INSERT INTO "SkuAlias" (id,"tenantId","sourceId","skuId",type,value) VALUES ('conflict','a','sheet','legacy','SKU','real-sku')`);
    if (binding === "other-source") await f.pg.exec(`INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('other','a','SALESDRIVE','other',now()); INSERT INTO "SkuAlias" (id,"tenantId","sourceId","skuId",type,value) VALUES ('conflict','a','other','legacy','SOURCE_PRODUCT_ID','other-product')`);
    if (binding === "order") await f.pg.exec(`INSERT INTO "OrderLine" (id,"tenantId","sourceId","importRunId","externalOrderId","externalLineId","skuId",quantity,"sourceRecordKey","observedAt","updatedAt") VALUES ('bound','a','sheet','first','o','l','legacy',1,'fixture',now(),now())`);
    if (binding === "receipt") await f.pg.exec(`INSERT INTO "Receipt" (id,"tenantId","sourceId","importRunId","externalId","sourceRecordKey","observedAt","updatedAt") VALUES ('r','a','sheet','first','r','fixture',now(),now()); INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId","skuId",quantity) VALUES ('rl','a','r','l','legacy',1)`);
    if (binding === "price") await f.pg.exec(`INSERT INTO "PriceHistory" (id,"tenantId","sourceId","importRunId","skuId","sourceRecordKey","observedAt") VALUES ('bound','a','sheet','first','legacy','fixture',now())`);
    if (binding === "stock") await f.pg.exec(`INSERT INTO "InventorySnapshot" (id,"tenantId","sourceId","importRunId","skuId","snapshotDate","observedAt",timezone,"sourceRecordKey") VALUES ('bound','a','sheet','first','legacy','2026-10-27',now(),'Europe/Kyiv','fixture')`);
    if (binding === "provenance") await f.pg.exec(`UPDATE "Sku" SET "catalogAttributes"='{"sourceId":"sheet"}' WHERE id='legacy'`);
    await expect(refresh()).rejects.toThrow("CATALOG_IDENTITY_CONFLICT");
    expect((await f.pg.query(`SELECT count(*)::int n FROM "InventorySnapshot" WHERE "importRunId"='second'`)).rows).toEqual([{ n: 0 }]);
    expect((await f.pg.query(`SELECT count(*)::int n FROM "DataSourceRecord" WHERE "importRunId"='second'`)).rows).toEqual([{ n: 0 }]);
  },
);

it("does not relax conflicts for an ordinary source SKU or another provider", async () => {
  const id = await anchor();
  await f.pg.query(`UPDATE "Sku" SET sku='ordinary-source-sku' WHERE id=$1`, [id]);
  await expect(refresh()).rejects.toThrow("CATALOG_IDENTITY_CONFLICT");
  await f.pg.query(`UPDATE "Sku" SET sku='@sheets:sheet:p' WHERE id=$1`, [id]);
  await expect(f.db.$transaction(tx => storeCatalog(tx, { ...scope, provider: "salesdrive", importRunId: "second" }, catalog("real-sku", "2026-10-29"))))
    .rejects.toThrow("CATALOG_IDENTITY_CONFLICT");
});
