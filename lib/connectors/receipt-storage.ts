import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { ReceiptDto } from "./contract";
import type { SqlClient } from "./database";
import { payloadHash, type OrderScope } from "./order-storage";
import { sourceDate, exact } from "./order-normalization";
import type { InventoryPolicy } from "./inventory-normalization";

export async function retainRecord(tx: SqlClient, scope: Pick<OrderScope, "tenantId" | "sourceId" | "importRunId">, resource: string, externalId: string, payload: unknown, observedAt: Date, updatedAt: Date | null = null) {
  const hash = payloadHash(payload), key = `${externalId}:${hash}`;
  await tx.$executeRaw(Prisma.sql`INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt","sourceUpdatedAt")
    VALUES (${randomUUID()},${scope.tenantId},${scope.sourceId},${scope.importRunId},${resource},${key},${JSON.stringify(payload)}::jsonb,${hash},${observedAt},${updatedAt})
    ON CONFLICT ("importRunId",resource,"externalId") DO NOTHING`);
  return key;
}

export async function refreshFirstReceipt(tx: SqlClient, tenantId: string, skuIds: string[]) {
  if (!skuIds.length) return;
  await tx.$executeRaw(Prisma.sql`UPDATE "Sku" s SET "firstReceiptAt"=(SELECT MIN(r."receivedAt") FROM "Receipt" r JOIN "ReceiptLine" l ON l."receiptId"=r.id AND l."tenantId"=r."tenantId"
    WHERE l."tenantId"=s."tenantId" AND l."skuId"=s.id AND l.quantity>0 AND r."movementType"='SUPPLIER_RECEIPT' AND r."postingVerifiedAt" IS NOT NULL)
    WHERE s."tenantId"=${tenantId} AND s.id IN (SELECT jsonb_array_elements_text(${JSON.stringify(skuIds)}::jsonb))`);
}

export async function storeReceipt(tx: SqlClient, scope: OrderScope, receipt: ReceiptDto, policy: InventoryPolicy) {
  if (!receipt.raw) throw new Error("RAW_PAYLOAD_MISSING");
  const { tenantId, sourceId, importRunId, timezone } = scope;
  const observedAt = new Date(receipt.observedAt), updatedAt = sourceDate(receipt.updatedAt, timezone).date;
  const received = sourceDate(receipt.receivedAt, timezone);
  const key = await retainRecord(tx, scope, "receipts", receipt.externalId, receipt.raw, observedAt, updatedAt);
  const [previous] = await tx.$queryRaw<Array<{ id: string; sourceRecordKey: string; sourceUpdatedAt: Date | null }>>(Prisma.sql`SELECT id,"sourceRecordKey","sourceUpdatedAt" FROM "Receipt" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND "externalId"=${receipt.externalId} FOR UPDATE`);
  if (previous && previous.sourceRecordKey !== key && (!updatedAt || !previous.sourceUpdatedAt || updatedAt <= previous.sourceUpdatedAt)) return { imported: 0, issues: ["RECEIPT_VERSION_CONFLICT"] };
  const issues = new Set<string>();
  const ids = new Set<string>();
  const candidates = receipt.lines.map((line, index) => {
    const externalLineId = line.externalLineId ? `native:${line.externalLineId}` : `position:${index}`;
    const quantity = exact(line.quantity), unitCost = line.unitCost === null ? null : exact(line.unitCost);
    if (!quantity || line.unitCost !== null && (!unitCost || unitCost.isNegative()) || ids.has(externalLineId)) return null;
    ids.add(externalLineId);
    if (quantity.isNegative()) issues.add("NEGATIVE_MOVEMENT_QUANTITY");
    if (!line.externalLineId) issues.add("DERIVED_RECEIPT_LINE_IDENTITY");
    return { ...line, quantity, unitCost, externalLineId };
  });
  const lines = candidates.filter((line) => line !== null);
  if (lines.length !== candidates.length) return { imported: 0, issues: ["INVALID_RECEIPT_LINE"] };
  const mapping = policy.receipts;
  const mappedSupplier = receipt.supplierId ? mapping?.suppliers[receipt.supplierId] : null;
  const [supplier] = mappedSupplier ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM "Supplier" WHERE "tenantId"=${tenantId} AND id=${mappedSupplier}`) : [];
  const supplierId = supplier?.id ?? null;
  const verifiedAt = new Date();
  const verified = receipt.movementType === "supplier_receipt" && Boolean(mapping?.postedStatuses.includes(receipt.statusId ?? "") && supplierId && received.date);
  if (receipt.movementType === "supplier_receipt" && !verified) issues.add("RECEIPT_POSTING_UNVERIFIED");
  if (!received.date) issues.add("RECEIPT_DATE_UNAVAILABLE");
  const types = { supplier_receipt: "SUPPLIER_RECEIPT", transfer: "TRANSFER", write_off: "WRITE_OFF", inventory_adjustment: "INVENTORY_ADJUSTMENT", unknown: "UNKNOWN" };
  const id = previous?.id ?? randomUUID();
  const previousSkus = previous ? await tx.$queryRaw<Array<{ skuId: string }>>(Prisma.sql`SELECT DISTINCT "skuId" FROM "ReceiptLine" WHERE "receiptId"=${id} AND "tenantId"=${tenantId} AND "skuId" IS NOT NULL`) : [];
  await tx.$executeRaw(Prisma.sql`INSERT INTO "Receipt" (id,"tenantId","sourceId","importRunId","externalId","movementType","sourceStatus","sourceCounterpartyId","sourceCounterpartyName","postingVerifiedAt","supplierId","receivedAt","datePrecision","observedAt","sourceUpdatedAt","sourceRecordKey","updatedAt")
    VALUES (${id},${tenantId},${sourceId},${importRunId},${receipt.externalId},${types[receipt.movementType]}::"ReceiptMovementType",${receipt.statusId},${receipt.supplierId},${receipt.supplierName ?? null},${verified ? verifiedAt : null},${supplierId},${received.date},${received.precision},${observedAt},${updatedAt},${key},now())
    ON CONFLICT ("tenantId","sourceId","externalId") DO UPDATE SET "importRunId"=EXCLUDED."importRunId","movementType"=EXCLUDED."movementType","sourceStatus"=EXCLUDED."sourceStatus","sourceCounterpartyId"=EXCLUDED."sourceCounterpartyId","sourceCounterpartyName"=EXCLUDED."sourceCounterpartyName",
      "postingVerifiedAt"=EXCLUDED."postingVerifiedAt","supplierId"=EXCLUDED."supplierId","receivedAt"=EXCLUDED."receivedAt","datePrecision"=EXCLUDED."datePrecision","observedAt"=EXCLUDED."observedAt","sourceUpdatedAt"=EXCLUDED."sourceUpdatedAt","sourceRecordKey"=EXCLUDED."sourceRecordKey","updatedAt"=now()`);
  await tx.$executeRaw(Prisma.sql`DELETE FROM "ReceiptLine" WHERE "receiptId"=${id} AND "tenantId"=${tenantId}`);
  const affected = new Set(previousSkus.map((row) => row.skuId));
  const productIdFor = (line: typeof lines[number]) => mapping?.productIdField === "id" ? line.productId : mapping?.productIdField === "parameter" ? line.sourceProductId ?? null : null;
  const productIds = [...new Set(lines.flatMap((line) => productIdFor(line) ? [productIdFor(line)!] : []))];
  const skus = [...new Set(lines.flatMap((line) => line.sku ? [line.sku] : []))];
  const aliases = await tx.$queryRaw<Array<{ type: string; value: string; skuId: string }>>(Prisma.sql`SELECT type,value,"skuId" FROM "SkuAlias" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId}
    AND ((type='SOURCE_PRODUCT_ID' AND value IN (SELECT jsonb_array_elements_text(${JSON.stringify(productIds)}::jsonb))) OR (type IN ('SKU','VENDOR_CODE') AND value IN (SELECT jsonb_array_elements_text(${JSON.stringify(skus)}::jsonb))))`);
  const aliasIndex = new Map(aliases.map((alias) => [`${alias.type}:${alias.value}`, alias.skuId]));
  const values = lines.map((line) => {
    const productId = productIdFor(line);
    const candidates = new Set([productId ? aliasIndex.get(`SOURCE_PRODUCT_ID:${productId}`) : undefined,
      line.sku ? aliasIndex.get(`SKU:${line.sku}`) : undefined, line.sku ? aliasIndex.get(`VENDOR_CODE:${line.sku}`) : undefined].filter((value): value is string => Boolean(value)));
    const skuId = candidates.size === 1 ? [...candidates][0] : null;
    if (!skuId) issues.add(candidates.size > 1 ? "SKU_ALIAS_CONFLICT" : "SKU_ALIAS_UNRESOLVED"); else affected.add(skuId);
    return Prisma.sql`(${randomUUID()},${tenantId},${id},${line.externalLineId},${skuId},${productId},${line.sku ?? null},${!line.externalLineId.startsWith("native:")},${line.quantity.toString()}::numeric,${line.unitCost?.toString() ?? null}::numeric,${mapping?.currency ?? null},${verified && mapping?.unitCostVerified && mapping.currency && line.quantity.gt(0) && line.unitCost?.gt(0) ? verifiedAt : null})`;
  });
  for (let offset=0; offset<values.length; offset+=500) await tx.$executeRaw(Prisma.sql`INSERT INTO "ReceiptLine" (id,"tenantId","receiptId","externalLineId","skuId","externalProductId","sourceSku","identityDerived",quantity,"unitCost",currency,"costVerifiedAt") VALUES ${Prisma.join(values.slice(offset,offset+500))}`);
  await refreshFirstReceipt(tx, tenantId, [...affected]);
  return { imported: 1, issues: [...issues] };
}
