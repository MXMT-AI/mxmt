import { inventoryPolicy } from "@/lib/connectors/inventory-normalization";
import { payloadHash } from "@/lib/connectors/order-storage";
import { createScreenDb } from "./screen-db";
import { createMerchandisingBrand } from "@/lib/merchandising-brand";
import {
  readClientSettings,
  saveMerchandisingSettings,
} from "@/lib/merchandising-settings-store";
export async function createMonobrandDb() {
  const f = await createScreenDb();
  await f.pg.exec(
    `UPDATE "Tenant" SET name='Zavod fixture' WHERE id='a'; UPDATE "Tenant" SET name='Bimba fixture' WHERE id='b'; INSERT INTO "User" (id,email,name,"passwordHash",role,"tenantId","updatedAt") VALUES ('owner-b','bimba@example.test','Owner B','test','ADMIN','b',now())`,
  );
  const references = new Set([
    "id",
    "sourceId",
    "importRunId",
    "supplierId",
    "brandId",
    "categoryId",
    "skuId",
    "receiptId",
    "connectionId",
    "activeImportRunId",
    "firstReceiptSourceId",
    "lastSuccessfulRunId",
  ]);
  for (const table of [
    "DataSource",
    "ConnectorConnection",
    "DataImportRun",
    "Supplier",
    "Brand",
    "Category",
    "Sku",
    "SkuAlias",
    "Receipt",
    "ReceiptLine",
    "InventorySnapshot",
    "OrderLine",
    "DataSourceRecord",
    "MerchandisingConfig",
    "ConnectorSyncJob",
    "SyncCursor",
  ]) {
    const rows = (
      await f.pg.query<Record<string, unknown>>(
        `SELECT to_jsonb(t) data FROM "${table}" t WHERE "tenantId"='a'`,
      )
    ).rows;
    for (const wrapped of rows) {
      const row = wrapped.data as Record<string, unknown>;
      for (const [k, v] of Object.entries(row)) {
        if (k === "tenantId") row[k] = "b";
        else if (k === "approvedById" && v === "owner") row[k] = "owner-b";
        else if (references.has(k) && typeof v === "string")
          row[k] = "bimba:" + v;
      }
      if (table === "MerchandisingConfig" && row.key === "salesdrive:source") {
        row.key = "salesdrive:bimba:source";
        const values = row.values as any;
        if (values.receipts)
          values.receipts.suppliers = { "1": "bimba:supplier" };
      }
      if (table === "ConnectorConnection") {
        row.accountHost = "bimba-fixture.salesdrive.me";
        row.encryptedConfig = "isolated-bimba-fixture";
      }
      await f.pg.query(
        `INSERT INTO "${table}" SELECT (jsonb_populate_record(NULL::"${table}",$1::jsonb)).*`,
        [JSON.stringify(row)],
      );
    }
  }
  const mapping = (
    await f.pg.query<{ values: unknown }>(
      `SELECT values FROM "MerchandisingConfig" WHERE "tenantId"='b' AND key='salesdrive:bimba:source'`,
    )
  ).rows[0].values;
  const receipts = inventoryPolicy(mapping),
    receiptHash = payloadHash(receipts);
  await f.pg.query(
    `UPDATE "ConnectorSyncJob" SET checkpoint=checkpoint||jsonb_build_object('policy',$1::jsonb,'policyHash',$2::text) WHERE "tenantId"='b' AND resource='inventory'`,
    [JSON.stringify(receipts), receiptHash],
  );
  await f.pg.query(
    `UPDATE "SyncCursor" SET checkpoint=checkpoint||jsonb_build_object('policyHash',$1::text) WHERE "tenantId"='b' AND resource='receipts'`,
    [receiptHash],
  );
  const brand = await createMerchandisingBrand("b", "owner-b", "Bimba", f.db);
  await saveMerchandisingSettings(
    "b",
    "owner-b",
    "brand",
    brand.id,
    0,
    { ownership: "OWN", commissionPct: null, supplierId: "bimba:supplier" },
    f.db,
  );
  const client = await readClientSettings("b", f.db);
  await saveMerchandisingSettings(
    "b",
    "owner-b",
    "client",
    null,
    client.revision,
    {
      ...client.values,
      profileMode: "MONOBRAND",
      monoBrandId: brand.id,
      deadDays: 60,
      monthlyPlans: { "2026-09": "1200" },
      planCurrency: "UAH",
    },
    f.db,
  );
  await f.pg.exec(
    `UPDATE "Sku" SET "brandId"=NULL WHERE "tenantId"='b'; UPDATE "InventorySnapshot" SET "qtyInTransit"=0,"inTransitVerifiedAt"='2026-10-25T05:00:00Z' WHERE "tenantId"='b'`,
  );
  return { ...f, brand };
}
