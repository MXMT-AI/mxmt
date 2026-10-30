import { Prisma } from "@prisma/client";
import type { SqlClient } from "./database";
import type { OrderScope } from "./order-storage";

export async function linkRetainedCatalogFacts(tx: SqlClient, scope: OrderScope) {
  const { tenantId, sourceId } = scope;
  await tx.$executeRaw(Prisma.sql`CREATE TEMP TABLE mxmt_catalog_pending (id text PRIMARY KEY,"externalProductId" text,"sourceSku" text) ON COMMIT DROP`);
  await tx.$executeRaw(Prisma.sql`CREATE TEMP TABLE mxmt_catalog_resolved (id text PRIMARY KEY,"skuId" text NOT NULL) ON COMMIT DROP`);
  for (const relation of ["OrderLine", "ReceiptLine"] as const) {
    const table = Prisma.raw(`"${relation}"`);
    const sourceScope = relation === "OrderLine"
      ? Prisma.sql`l."sourceId"=${sourceId}`
      : Prisma.sql`EXISTS (SELECT 1 FROM "Receipt" r WHERE r.id=l."receiptId" AND r."tenantId"=${tenantId} AND r."sourceId"=${sourceId})`;
    await tx.$executeRaw(Prisma.sql`TRUNCATE mxmt_catalog_pending`);
    await tx.$executeRaw(Prisma.sql`TRUNCATE mxmt_catalog_resolved`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO mxmt_catalog_pending SELECT l.id,l."externalProductId",l."sourceSku" FROM ${table} l
      WHERE l."tenantId"=${tenantId} AND ${sourceScope} AND l."skuId" IS NULL`);
    await tx.$executeRaw(Prisma.sql`ANALYZE mxmt_catalog_pending`);
    await tx.$executeRaw(Prisma.sql`
      WITH candidates AS (
        SELECT p.id,t."skuId" FROM mxmt_catalog_pending p JOIN mxmt_catalog_stage t ON t."externalId"=p."externalProductId"
        UNION ALL
        SELECT p.id,t."skuId" FROM mxmt_catalog_pending p JOIN mxmt_catalog_stage t ON t.article=p."sourceSku"
      )
      INSERT INTO mxmt_catalog_resolved SELECT id,MIN("skuId") FROM candidates GROUP BY id HAVING count(DISTINCT "skuId")=1
    `);
    await tx.$executeRaw(Prisma.sql`ANALYZE mxmt_catalog_resolved`);
    await tx.$executeRaw(Prisma.sql`UPDATE ${table} l SET "skuId"=r."skuId" FROM mxmt_catalog_resolved r
      WHERE l.id=r.id AND l."tenantId"=${tenantId} AND l."skuId" IS NULL
    `);
  }
  await tx.$executeRaw(Prisma.sql`DROP TABLE mxmt_catalog_resolved, mxmt_catalog_pending`);
}
