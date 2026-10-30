import { createScreenDb } from "./screen-db";
export async function createStockWorkspaceDb() {
  const fixture = await createScreenDb(),
    { pg } = fixture;
  await pg.exec(`UPDATE "Brand" SET name=CASE id WHEN 'brand-a' THEN 'CITIZEN' ELSE 'CASIO' END WHERE "tenantId"='a';
 INSERT INTO "Brand" (id,"tenantId",name,ownership) VALUES ('brand-chpo','a','CHPO','OWN'),('brand-active','a','ACTIVE','OWN');
 INSERT INTO "Category" (id,"tenantId",key,name,"seasonMonths","updatedAt") VALUES ('cat-chpo','a','sunglasses','Sunglasses','{4,5,6,7,8,9}',now());
 UPDATE "Sku" SET "brandId"='brand-chpo',"categoryId"='cat-chpo',category='Sunglasses' WHERE id='sku-c';
 INSERT INTO "Receipt" (id,"tenantId","sourceId","importRunId","externalId","movementType","postingVerifiedAt","receivedAt","observedAt","sourceRecordKey","supplierId","updatedAt") VALUES ('receipt-new','a','source','inventory-run','r-new','SUPPLIER_RECEIPT',now(),'2026-10-07T00:00:00+03:00','2026-10-07T03:00:00+03:00','r-new-raw','supplier',now());
 UPDATE "ReceiptLine" SET "receiptId"='receipt-new' WHERE "skuId" IN ('sku-b','sku-d');
 UPDATE "InventorySnapshot" SET quantity=100 WHERE "skuId"='sku-b';`);
  const add = async (
    id: string,
    brand: string | null,
    category: string,
    quantity: number,
    kind = "MERCHANDISE",
  ) => {
    await pg.query(
      `INSERT INTO "Sku" (id,"tenantId",sku,name,category,"brandId","categoryId","productKind") VALUES ($1,'a',$1,$1,$3,$2,$3,$4::"MerchandiseProductKind")`,
      [id, brand, category, kind],
    );
    await pg.query(
      `INSERT INTO "SkuAlias" (id,"tenantId","skuId","sourceId",type,value) VALUES ($1,'a',$1,'source','SOURCE_PRODUCT_ID',$1)`,
      [id],
    );
    await pg.query(
      `INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId","skuId",quantity) VALUES ($1,'a','receipt',$1,$1,1)`,
      [id],
    );
    await pg.query(
      `INSERT INTO "InventorySnapshot" (id,"tenantId","skuId","snapshotDate","sourceId","importRunId","sourceRecordKey","observedAt",timezone,quantity,"costPrice","retailPrice",currency)
   SELECT $1||':'||"snapshotDate",'a',$1,"snapshotDate",'source','inventory-run','raw:'||$1||':'||"snapshotDate","observedAt",timezone,$2,10,20,'UAH' FROM "InventorySnapshot" WHERE "skuId"='sku-a'`,
      [id, quantity],
    );
  };
  const sale = async (id: string, quantity: number) => {
    await pg.query(
      `INSERT INTO "OrderLine" SELECT (jsonb_populate_record(NULL::"OrderLine",to_jsonb(l)||$1::jsonb)).* FROM "OrderLine" l WHERE "externalOrderId"='one' AND "skuId"='sku-a'`,
      [
        JSON.stringify({
          id: "stock-sale-" + id,
          externalOrderId: "stock-sale-" + id,
          externalLineId: id,
          skuId: id,
          externalProductId: id,
          sourceRecordKey: "stock-sale-" + id,
          quantity,
          signedQuantity: quantity,
          netAmount: quantity * 20,
          signedRevenue: quantity * 20,
          costAmount: quantity * 10,
          signedCost: quantity * 10,
        }),
      ],
    );
  };
  await add("sku-healthy", "brand-active", "cat-a", 8);
  await sale("sku-healthy", 12);
  await add("sku-risk", "brand-active", "cat-a", 20);
  await sale("sku-risk", 12);
  await add("sku-oos", "brand-active", "cat-a", 0);
  await sale("sku-oos", 12);
  await add("sku-service", null, "cat-a", 9, "SERVICE");
  await add("sku-unassigned", null, "cat-a", 2);
  for (let i = 0; i < 12; i++) {
    await pg.query(
      `INSERT INTO "Brand" (id,"tenantId",name,ownership) VALUES ($1,'a',$2,'OWN')`,
      ["extra-brand-" + i, "Brand " + i],
    );
    await pg.query(
      `INSERT INTO "Category" (id,"tenantId",key,name,"updatedAt") VALUES ($1,'a',$1,$2,now())`,
      ["extra-cat-" + i, "Category " + String(i).padStart(2, "0")],
    );
    await add("extra-" + i, "extra-brand-" + i, "extra-cat-" + i, (i + 1) / 10);
  }
  return { ...fixture, add, sale };
}
