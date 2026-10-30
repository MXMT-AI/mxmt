import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createMerchandisingDb } from "../helpers/merchandising-db";
import { storeCatalog } from "@/lib/connectors/catalog-storage";
import type { CatalogSnapshot } from "@/lib/connectors/contract";
let f: Awaited<ReturnType<typeof createMerchandisingDb>>;
const scope = { tenantId: "a", sourceId: "source", importRunId: "run", timezone: "Europe/Kyiv" };
const observation = "2026-10-26T12:00:00Z";
const catalog = (): CatalogSnapshot => ({
  observedAt: observation, rawResponse: "synthetic",
  products: [{ externalId: "p", sku: "sku", name: "Product", brand: null, categoryId: null, barcode: null, retailPrice: "100", oldPrice: null, costPrice: null, currency: "UAH", observedAt: observation, updatedAt: null, raw: {} }],
  stock: [{ externalId: "p", productId: "p", onHand: "1", inTransit: null, observedAt: observation, updatedAt: null }],
});
beforeAll(async () => { f = await createMerchandisingDb(); }, 30000);
afterAll(async () => f?.pg.close());
beforeEach(async () => {
  await f.pg.exec(`TRUNCATE "Tenant" CASCADE;
    INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now());
    INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('source','a','SALESDRIVE','source',now());
    INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES ('run','a','source','MANUAL','SUCCESS','fixture',current_date,now());`);
  await f.db.$transaction(tx => storeCatalog(tx, scope, catalog()));
});
async function sale(id: string, date: string, cost: string | null, currency = "UAH") {
  await f.pg.query(`INSERT INTO "OrderLine" (id,"tenantId","sourceId","importRunId","externalOrderId","externalLineId",kind,"skuId",quantity,"costAmount",currency,"sourceAmounts","sourceRecordKey","paidAt","observedAt","updatedAt")
    SELECT $1,'a','source','run',$1,'line','SALE',id,1,$3::numeric,$4,jsonb_build_object('unitCost',$3::text),'fixture',$2::timestamptz,$2::timestamptz,now() FROM "Sku" WHERE "tenantId"='a'`, [id, date, cost, currency]);
}
async function receipt(id: string, date: string, cost: string) {
  await f.pg.query(`INSERT INTO "Receipt" (id,"tenantId","sourceId","importRunId","externalId","sourceRecordKey","movementType","postingVerifiedAt","receivedAt","observedAt","updatedAt") VALUES ($1,'a','source','run',$1,'fixture','SUPPLIER_RECEIPT',now(),$2,$2,now())`, [id, date]);
  await f.pg.query(`INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId","skuId",quantity,"unitCost",currency,"costVerifiedAt") SELECT $1,'a',$1,'line',id,1,$2,'UAH',now() FROM "Sku" WHERE "tenantId"='a'`, [id, cost]);
}
async function cost() {
  await f.db.$transaction(tx => storeCatalog(tx, scope, catalog()));
  return (await f.pg.query(`SELECT "costPrice","costProvenance"->>'type' AS type FROM "InventorySnapshot"`)).rows[0];
}
it("keeps all agreeing latest sale ties and ignores future evidence", async () => {
  await sale("older", "2026-10-20", "20");
  await sale("latest1", "2026-10-25", "40");
  await sale("latest2", "2026-10-25", "40");
  await sale("future", "2026-10-27", "90");
  expect(await cost()).toEqual({ costPrice: "40.0000", type: "sale" });
});
it.each(["conflicting", "missing", "currency"])("does not fall back to an older sale when the latest evidence is %s", async reason => {
  await sale("older", "2026-10-20", "20");
  await sale("latest1", "2026-10-25", "40");
  await sale("latest2", "2026-10-25", reason === "missing" ? null : "50", reason === "currency" ? "EUR" : "UAH");
  expect(await cost()).toEqual({ costPrice: null, type: null });
});
it("prioritizes verified receipts and does not choose arbitrarily between same-day receipt costs", async () => {
  await sale("sale", "2026-10-25", "30");
  await receipt("r1", "2026-10-24", "40");
  await receipt("r2", "2026-10-24", "40");
  expect(await cost()).toEqual({ costPrice: "40.0000", type: "receipt" });
  await receipt("r3", "2026-10-24", "50");
  expect(await cost()).toEqual({ costPrice: "30.0000", type: "sale" });
});
