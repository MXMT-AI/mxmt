import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { OrderDto } from "./contract";
import type { SqlClient } from "./database";
import { normalizeOrder, type OrderPolicy } from "./order-normalization";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
export const payloadHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export interface OrderScope { tenantId: string; sourceId: string; importRunId: string; timezone: string }

/** Called inside the checkpoint transaction. Current projections are replaced as an order, never appended per replay. */
export async function storeOrder(tx: SqlClient, scope: OrderScope, order: OrderDto, policy: OrderPolicy = {}) {
  if (!order.raw) throw new Error("RAW_PAYLOAD_MISSING");
  const { tenantId, sourceId, importRunId, timezone } = scope;
  const hash = payloadHash(order.raw), normalized = normalizeOrder(order, timezone, policy), observedAt = new Date(order.observedAt);
  const productIds = order.lines.flatMap((line) => line.productId ? [line.productId] : []);
  const skus = order.lines.flatMap((line) => line.sku ? [line.sku] : []);
  const aliases = order.lines.length ? await tx.$queryRaw<Array<{ type: string; value: string; skuId: string }>>(Prisma.sql`
    SELECT type,value,"skuId" FROM "SkuAlias" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId}
    AND ((type='SOURCE_PRODUCT_ID' AND value IN (${Prisma.join(productIds.length ? productIds : [""])})) OR (type IN ('SKU','VENDOR_CODE') AND value IN (${Prisma.join(skus.length ? skus : [""])}))) ORDER BY type,value,"skuId"`) : [];
  const projectionHash = payloadHash({ version: 1, timezone, policy, aliases });
  const rawKey = `${order.externalId}:${hash}`;
  await tx.$executeRaw(Prisma.sql`INSERT INTO "DataSourceRecord" (id,"tenantId","sourceId","importRunId",resource,"externalId",payload,"payloadHash","observedAt","sourceUpdatedAt")
    VALUES (${randomUUID()},${tenantId},${sourceId},${importRunId},'orders',${rawKey},${JSON.stringify(order.raw)}::jsonb,${hash},${observedAt},${normalized.updatedAt})
    ON CONFLICT ("importRunId",resource,"externalId") DO NOTHING`);
  // A source has a single fenced job; the order row lock also guards direct consumers.
  const [previous] = await tx.$queryRaw<Array<{ payloadHash: string; projectionHash: string; sourceVersion: number | null; sourceUpdatedAt: Date | null }>>(Prisma.sql`
    SELECT "payloadHash","projectionHash","sourceVersion","sourceUpdatedAt" FROM "OrderImportState"
    WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND "externalOrderId"=${order.externalId} FOR UPDATE`);
  if (previous?.payloadHash === hash && previous.projectionHash === projectionHash) return { outcome: "duplicate", issues: [] as string[] };
  if (previous && previous.payloadHash !== hash) {
    const version = order.sourceVersion;
    const comparableVersion = version != null && previous.sourceVersion != null;
    const newer = comparableVersion ? version > previous.sourceVersion!
      : normalized.updatedAt && previous.sourceUpdatedAt && normalized.updatedAt > previous.sourceUpdatedAt;
    if (!newer) {
      const stale = comparableVersion ? version < previous.sourceVersion! : normalized.updatedAt && previous.sourceUpdatedAt && normalized.updatedAt < previous.sourceUpdatedAt;
      return { outcome: stale ? "stale" : "quarantined", issues: stale ? [] : ["ORDER_VERSION_CONFLICT"] };
    }
  }
  if (!normalized.valid) return { outcome: "quarantined", issues: normalized.issues };
  await tx.$executeRaw(Prisma.sql`DELETE FROM "OrderLine" WHERE "tenantId"=${tenantId} AND "sourceId"=${sourceId} AND "externalOrderId"=${order.externalId} AND "eventKey"='current'`);
  const rows = normalized.lines.map((line) => {
    const candidates = new Set(aliases.filter((alias) => alias.type === "SOURCE_PRODUCT_ID" ? alias.value === line.externalProductId : alias.value === line.sourceSku).map((alias) => alias.skuId));
    const skuId = candidates.size === 1 ? [...candidates][0] : null;
    if (!skuId) normalized.issues.push(candidates.size > 1 ? "SKU_ALIAS_CONFLICT" : "SKU_ALIAS_UNRESOLVED");
    return Prisma.sql`(${randomUUID()},${tenantId},${sourceId},${importRunId},${order.externalId},${line.externalLineId},'current',${skuId},${line.externalProductId},${line.sourceSku},${line.statusId},${line.channelId},${line.kind}::"OrderLineKind",
      ${line.orderedAt},${line.paidAt},NULL,false,${line.quantity.toString()}::numeric,${line.netAmount?.toFixed(4) ?? null}::numeric,${line.costAmount?.toFixed(4) ?? null}::numeric,${line.currency},
      ${JSON.stringify(line.sourceAmounts)}::jsonb,${JSON.stringify(line.datePrecision)}::jsonb,${line.identityDerived},${rawKey},${normalized.updatedAt},${observedAt},now())`;
  });
  // Bound each statement's parameter count while keeping the whole order atomic.
  for (let offset = 0; offset < rows.length; offset += 500) {
    await tx.$executeRaw(Prisma.sql`INSERT INTO "OrderLine" (id,"tenantId","sourceId","importRunId","externalOrderId","externalLineId","eventKey",
      "skuId","externalProductId","sourceSku","statusId","channelId",kind,"orderedAt","paidAt","returnedAt","dateInferred",quantity,"netAmount","costAmount",currency,
      "sourceAmounts","datePrecision","identityDerived","sourceRecordKey","sourceUpdatedAt","observedAt","updatedAt") VALUES ${Prisma.join(rows.slice(offset, offset + 500))}`);
  }
  await tx.$executeRaw(Prisma.sql`INSERT INTO "OrderImportState" (id,"tenantId","sourceId","importRunId","externalOrderId","sourceVersion","sourceUpdatedAt","payloadHash","projectionHash","observedAt")
    VALUES (${randomUUID()},${tenantId},${sourceId},${importRunId},${order.externalId},${order.sourceVersion ?? null},${normalized.updatedAt},${hash},${projectionHash},${observedAt})
    ON CONFLICT ("tenantId","sourceId","externalOrderId") DO UPDATE SET "importRunId"=EXCLUDED."importRunId","sourceVersion"=EXCLUDED."sourceVersion",
      "sourceUpdatedAt"=EXCLUDED."sourceUpdatedAt","payloadHash"=EXCLUDED."payloadHash","projectionHash"=EXCLUDED."projectionHash","observedAt"=EXCLUDED."observedAt"`);
  return { outcome: "imported", issues: normalized.issues };
}
