import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { OrderDto } from "./contract";
import type { SqlClient } from "./database";
import { normalizeOrder, type OrderPolicy } from "./order-normalization";
import { payloadHash, type OrderScope } from "./order-storage";

export function prepareOrderSnapshot(
  orders: OrderDto[],
  timezone: string,
  policy: OrderPolicy,
) {
  const issues = new Set<string>();
  const documents = orders.map((order) => {
    const result = normalizeOrder(order, timezone, policy);
    result.issues.forEach((code) => issues.add(code));
    if (!result.valid) throw new Error("INVALID_ORDER_SNAPSHOT");
    const hash = payloadHash(order.raw),
      key = `${order.externalId}:${hash}`;
    return {
      externalId: order.externalId,
      hash,
      key,
      raw: order.raw,
      observedAt: order.observedAt,
      updatedAt: result.updatedAt?.toISOString() ?? null,
      lines: result.lines.map((line) => ({
        ...line,
        id: randomUUID(),
        quantity: line.quantity?.toString(),
        netAmount: line.netAmount?.toString() ?? null,
        costAmount: line.costAmount?.toString() ?? null,
        signedQuantity: line.signedQuantity?.toString() ?? null,
        signedRevenue: line.signedRevenue?.toString() ?? null,
        signedCost: line.signedCost?.toString() ?? null,
        orderedAt: line.orderedAt?.toISOString() ?? null,
        paidAt: line.paidAt?.toISOString() ?? null,
        returnedAt: line.returnedAt?.toISOString() ?? null,
      })),
    };
  });
  return { documents, issues: [...issues], policy };
}
export async function replaceOrderSnapshot(
  tx: SqlClient,
  scope: OrderScope,
  prepared: ReturnType<typeof prepareOrderSnapshot>,
) {
  const { tenantId, sourceId, importRunId } = scope;
  await tx.$executeRaw(
    Prisma.sql`CREATE TEMP TABLE mxmt_order_snapshot_stage ("externalId" text,hash text,key text,raw jsonb,"observedAt" timestamptz,"updatedAt" timestamptz,lines jsonb) ON COMMIT DROP`,
  );
  for (let offset = 0; offset < prepared.documents.length; offset += 500)
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO mxmt_order_snapshot_stage SELECT * FROM jsonb_to_recordset(${JSON.stringify(prepared.documents.slice(offset, offset + 500))}::jsonb) AS x("externalId" text,hash text,key text,raw jsonb,"observedAt" timestamptz,"updatedAt" timestamptz,lines jsonb)`,
    );
  await tx.$executeRaw(
    Prisma.sql`INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt","sourceUpdatedAt") SELECT ${randomUUID()}||':'||key,${tenantId},${sourceId},${importRunId},'orders',key,raw,hash,"observedAt","updatedAt" FROM mxmt_order_snapshot_stage ON CONFLICT ("importRunId",resource,"externalId") DO NOTHING`,
  );
  await tx.$executeRaw(
    Prisma.sql`DELETE FROM "OrderLine" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND "eventKey"='current'`,
  );
  await tx.$executeRaw(
    Prisma.sql`DELETE FROM "OrderImportState" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId}`,
  );
  const inserted =
    await tx.$executeRaw(Prisma.sql`INSERT INTO "OrderLine" (id,"tenantId","sourceId","importRunId","externalOrderId","externalLineId","eventKey","skuId","externalProductId","sourceSku","statusId","channelId",kind,"orderedAt","paidAt","returnedAt","dateInferred",quantity,"netAmount","costAmount",currency,"sourceAmounts","datePrecision","identityDerived","sourceRecordKey","sourceUpdatedAt","observedAt","updatedAt","signedQuantity","signedRevenue","signedCost",normalization)
 SELECT l.id,${tenantId},${sourceId},${importRunId},t."externalId",l."externalLineId",'current',a."skuId",l."externalProductId",l."sourceSku",l."statusId",l."channelId",l.kind::"OrderLineKind",l."orderedAt",l."paidAt",l."returnedAt",l."dateInferred",l.quantity,l."netAmount",l."costAmount",l.currency,l."sourceAmounts",l."datePrecision",l."identityDerived",t.key,t."updatedAt",t."observedAt",now(),l."signedQuantity",l."signedRevenue",l."signedCost",l.normalization
 FROM mxmt_order_snapshot_stage t CROSS JOIN LATERAL jsonb_to_recordset(t.lines) AS l(id text,"externalLineId" text,"externalProductId" text,"sourceSku" text,"statusId" int,"channelId" text,kind text,"orderedAt" timestamptz,"paidAt" timestamptz,"returnedAt" timestamptz,"dateInferred" boolean,quantity numeric,"netAmount" numeric,"costAmount" numeric,currency text,"sourceAmounts" jsonb,"datePrecision" jsonb,"identityDerived" boolean,"signedQuantity" numeric,"signedRevenue" numeric,"signedCost" numeric,normalization jsonb)
 LEFT JOIN LATERAL (SELECT MIN("skuId") "skuId" FROM "SkuAlias" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND ((type='SOURCE_PRODUCT_ID' AND value=l."externalProductId") OR (type IN ('SKU','VENDOR_CODE') AND value=l."sourceSku")) HAVING count(DISTINCT "skuId")=1) a ON true`);
  await tx.$executeRaw(
    Prisma.sql`INSERT INTO "OrderImportState" (id,"tenantId","sourceId","importRunId","externalOrderId","payloadHash","projectionHash","sourceUpdatedAt","observedAt") SELECT ${randomUUID()}||':'||t."externalId",${tenantId},${sourceId},${importRunId},t."externalId",t.hash,${payloadHash({ version: 1, importRunId, policy: prepared.policy })},t."updatedAt",t."observedAt" FROM mxmt_order_snapshot_stage t`,
  );
  return inserted;
}
