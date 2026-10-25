import { inventoryPolicy } from "@/lib/connectors/inventory-normalization";
import { payloadHash, storeOrder } from "@/lib/connectors/order-storage";
import { parseOrderPolicy } from "@/lib/connectors/order-policy";
import { applyClientOrderSettings } from "@/lib/merchandising-order-policy";
import { defaultClientSettings } from "@/lib/merchandising-settings";
import {
  saveMerchandisingSettings,
  readClientSettings,
} from "@/lib/merchandising-settings-store";
import { createMerchandisingDb } from "./merchandising-db";
import type { OrderDto } from "@/lib/connectors/contract";
export const screenSelection = {
  dateFrom: "2026-09-01",
  dateTo: "2026-09-30",
  asOf: "2026-10-25",
  now: new Date("2026-10-25T10:00:00Z"),
};
export async function createScreenDb() {
  const { pg, db } = await createMerchandisingDb();
  await pg.exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now()),('b','B','b',now());
 INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt") VALUES ('owner','owner@example.test','test','Owner','ADMIN','a',now());
 INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('source','a','SALESDRIVE','fixture',now());
 INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","updatedAt") VALUES ('connection','a','source','demo.salesdrive.me','test',now());
 INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt","completedAt") VALUES ('orders-run','a','source','MANUAL','SUCCESS','orders-fixture',now(),now(),now()),('inventory-run','a','source','MANUAL','SUCCESS','inventory-fixture',now(),now(),now());
 INSERT INTO "Supplier" (id,"tenantId",key,name,"leadTimeDays","coverDays",moq,"termsVerifiedAt","updatedAt") VALUES ('supplier','a','supplier','Supplier',30,60,1,now(),now());
 INSERT INTO "Brand" (id,"tenantId",name,ownership,"commissionRate","supplierId") VALUES ('brand-a','a','Brand A','OWN',NULL,'supplier'),('brand-b','a','Brand B','CONSIGNMENT',0.2,'supplier');
 INSERT INTO "Category" (id,"tenantId",key,name,"updatedAt") VALUES ('cat-a','a','a','Category A',now()),('cat-b','a','b','Category B',now());
 INSERT INTO "Sku" (id,"tenantId",sku,name,category,"brandId","categoryId","productKind",barcode) VALUES ('sku-a','a','A','Alpha 100%','Category A','brand-a','cat-a','MERCHANDISE','0001'),('sku-b','a','B','Beta','Category B','brand-b','cat-b','MERCHANDISE','0002'),('sku-c','a','C','Gamma','Category A',NULL,'cat-a','MERCHANDISE',NULL),('sku-d','a','D','Delta','Category B','brand-b','cat-b','MERCHANDISE',NULL);
 INSERT INTO "SkuAlias" (id,"tenantId","skuId","sourceId",type,value) SELECT s.id,'a',s.id,'source','SOURCE_PRODUCT_ID',s.id FROM "Sku" s WHERE s."tenantId"='a';
 INSERT INTO "InventorySnapshot" (id,"tenantId","skuId","snapshotDate","sourceId","importRunId","sourceRecordKey","observedAt",timezone,quantity,"costPrice","retailPrice",currency)
 SELECT s.id||':'||d::date,'a',s.id,d::date,'source','inventory-run','raw:'||s.id||':'||d::date,(d::date+time '03:00') AT TIME ZONE 'Europe/Kyiv','Europe/Kyiv',CASE s.id WHEN 'sku-a' THEN 12 WHEN 'sku-b' THEN 0 WHEN 'sku-c' THEN 3 ELSE 2 END,CASE s.id WHEN 'sku-a' THEN 10 WHEN 'sku-b' THEN 5 WHEN 'sku-c' THEN 7 ELSE 8 END,20,CASE s.id WHEN 'sku-d' THEN 'USD' ELSE 'UAH' END
 FROM "Sku" s CROSS JOIN generate_series('2026-08-02'::date,'2026-10-25'::date,'1 day') d WHERE s."tenantId"='a';
 INSERT INTO "Receipt" (id,"tenantId","sourceId","importRunId","externalId","movementType","postingVerifiedAt","receivedAt","observedAt","sourceRecordKey","supplierId","updatedAt") VALUES ('receipt','a','source','inventory-run','r1','SUPPLIER_RECEIPT',now(),'2025-01-01T00:00:00+02:00','2025-01-01T03:00:00+02:00','r-raw','supplier',now());
 INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId","skuId",quantity) SELECT s.id,'a','receipt',s.id,s.id,1 FROM "Sku" s WHERE s."tenantId"='a';`);
  const mapping = {
    statuses: { "5": "SALE", "7": "RETURN", "33": "PREORDER" },
    channels: { "1": "Shop", "2": "Online" },
    amounts: {
      price: "gross_unit",
      absoluteDiscount: "line",
      currency: "UAH",
      cost: "unit",
    },
    receipts: {
      postedStatuses: ["1"],
      suppliers: { "1": "supplier" },
      productIdField: "id",
      currency: "UAH",
      unitCostVerified: true,
    },
  };
  await pg.query(
    `INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference") VALUES ('mapping','a','SOURCE_MAPPING','salesdrive:source',1,$1,true,'owner',now(),'test')`,
    [JSON.stringify(mapping)],
  );
  await saveMerchandisingSettings(
    "a",
    "owner",
    "client",
    null,
    0,
    {
      ...defaultClientSettings(),
      saleStatuses: ["5"],
      saleStatusesVerified: true,
    },
    db,
  );
  const client = await readClientSettings("a", db),
    policy = applyClientOrderSettings(
      parseOrderPolicy(mapping),
      client.values,
      { id: client.id!, revision: client.revision },
    );
  const receipts = inventoryPolicy(mapping),
    receiptHash = payloadHash(receipts);
  await pg.query(
    `INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",resource,mode,state,"connectionRevision",checkpoint,stats,"updatedAt") VALUES ('orders-job','a','source','orders-run','orders','BACKFILL','COMPLETE',1,$1,'{}',now()),('inventory-job','a','source','inventory-run','inventory','REFRESH','COMPLETE',1,$2,'{"pages":1}',now())`,
    [
      JSON.stringify({
        from: "2024-01-01T00:00:00+02:00",
        to: "2026-10-25T09:00:00Z",
        policy,
      }),
      JSON.stringify({
        stage: "catalog",
        policy: receipts,
        policyHash: receiptHash,
      }),
    ],
  );
  await pg.query(
    `INSERT INTO "SyncCursor" (id,"tenantId","sourceId",resource,checkpoint,"lastSuccessfulRunId","updatedAt") VALUES ('orders-cursor','a','source','orders','{"through":"2026-10-25T09:00:00Z"}','orders-run',now()),('receipt-cursor','a','source','receipts',$1,'inventory-run',now())`,
    [
      JSON.stringify({
        through: "2026-10-25T09:00:00Z",
        policyHash: receiptHash,
      }),
    ],
  );
  const line = (sku: string, quantity: string, cost: string) => ({
    externalLineId: sku,
    productId: sku,
    sku: sku.slice(-1).toUpperCase(),
    quantity,
    unitPrice: "20",
    discount: "0",
    discountUnit: "amount" as const,
    costPrice: cost,
    commission: null,
    commissionUnit: "unknown" as const,
  });
  const order = (
    id: string,
    date: string,
    channelId: string | null,
    lines: OrderDto["lines"],
    statusId = "5",
  ): OrderDto => ({
    externalId: id,
    orderedAt: date,
    paidAt: date,
    returnedAt: statusId === "7" ? date : null,
    observedAt: "2026-10-25T09:00:00Z",
    updatedAt: "2026-10-25T08:00:00Z",
    statusId,
    channelId,
    lines,
    raw: { id, date },
  });
  for (const value of [
    order("one", "2026-09-10", "1", [
      line("sku-a", "2", "10"),
      line("sku-b", "3", "5"),
    ]),
    order("two", "2026-09-11", "2", [line("sku-a", "1", "10")]),
    order("return", "2026-09-12", "1", [line("sku-a", "-1", "10")], "7"),
    order("three", "2026-09-13", null, [line("sku-c", "0.5", "7")]),
    order("ly-one", "2025-09-10", "1", [
      line("sku-a", "1", "10"),
      line("sku-b", "2", "5"),
    ]),
    order("ly-two", "2025-09-11", "2", [line("sku-a", "1", "10")]),
    order("preorder", "2026-09-14", "1", [line("sku-a", "10", "10")], "33"),
  ])
    await db.$transaction((tx) =>
      storeOrder(
        tx,
        {
          tenantId: "a",
          sourceId: "source",
          importRunId: "orders-run",
          timezone: "Europe/Kyiv",
        },
        value,
        policy,
      ),
    );
  return { pg, db, client };
}
