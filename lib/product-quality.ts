import { selectedConnection } from "./connectors/source";
import "server-only";
import { readClientSettings } from "./merchandising-settings-store";
import { defaultClientSettings } from "./merchandising-settings";
import { clientOrderFilterFingerprint } from "./merchandising-order-policy";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withCalculationSnapshot } from "./calculation-snapshot";
import type { SqlDatabase } from "@/lib/connectors/database";
import type { SqlClient } from "@/lib/connectors/database";
import {
  productAgeReference,
  productEligibility,
} from "@/lib/data-normalization";

/** Current-connection observations and explicit per-product exceptions, retaining input lineage. */
function qualityBase(tenantId: string, monoBrandId: string | null) {
  const sourceBrand = Prisma.sql`CASE WHEN s."catalogAttributes" ? 'normalization' THEN s."catalogAttributes"->'normalization'->>'brandKey' ELSE NULLIF(btrim(s."catalogAttributes"->>'vendor'),'') END`;
  return Prisma.sql`WITH latest AS (
 SELECT DISTINCT ON (i."skuId") i.* FROM "InventorySnapshot" i JOIN "ConnectorConnection" c ON c."sourceId"=i."sourceId" AND c."tenantId"=i."tenantId" WHERE i."tenantId"=${tenantId} AND ${selectedConnection()} ORDER BY i."skuId",i."observedAt" DESC,i."snapshotDate" DESC,i.id DESC
), base AS (
 SELECT s.id,s.sku,s.name,s."productKind",s."brandId",s."categoryId",s."firstReceiptAt",i.quantity,i."retailPrice",i."costPrice",
 CASE WHEN i.quantity>=0 AND i."costPrice">0 THEN COALESCE(i."costValue",i.quantity*i."costPrice") END "costValue",i."retailValue",
 COALESCE(s."ownershipOverride",b.ownership,'UNKNOWN') ownership,COALESCE(s."supplierId",b."supplierId") "supplierId",i.currency,i."observedAt",i."importRunId",i."sourceRecordKey",i."sourceId",
   COALESCE(b."normalizationKey",NULLIF(upper(btrim(b.name)),''),'UNBRANDED') "brandKey",
   (SELECT MIN(l."paidAt") FROM "OrderLine" l WHERE l."tenantId"=s."tenantId" AND l."skuId"=s.id AND l."sourceId"=i."sourceId" AND l.kind='SALE' AND l.quantity>0 AND l."netAmount" IS NOT NULL) "firstSaleAt",
   array_remove(ARRAY[
    CASE WHEN b.id IS NULL AND (${sourceBrand}) IS NULL AND s."productKind" NOT IN ('SERVICE','GIFT_CARD') THEN 'MISSING_BRAND' END,
    CASE WHEN (${sourceBrand}) IS NOT NULL AND b.id IS NULL THEN 'BRAND_IDENTITY_CONFLICT' END,
    CASE WHEN s."productKind" NOT IN ('SERVICE','GIFT_CARD') AND i.quantity>0 AND i."retailPrice"=0 THEN 'ZERO_PRICE_WITH_STOCK' END,
    CASE WHEN (i."costPrice" IS NULL AND s."productKind"<>'GIFT_CARD') OR (i."costPrice"<=0 AND s."productKind" NOT IN ('SERVICE','GIFT_CARD')) THEN 'MISSING_COST' END,
    CASE WHEN s."categoryId" IS NULL AND s."productKind" NOT IN ('SERVICE','GIFT_CARD') THEN 'MISSING_CATEGORY' END,
    CASE WHEN COALESCE(s."ownershipOverride",b.ownership,'UNKNOWN')='UNKNOWN' AND s."productKind" NOT IN ('SERVICE','GIFT_CARD') THEN 'OWNERSHIP_UNKNOWN' END,
    CASE WHEN COALESCE(s."ownershipOverride",b.ownership,'UNKNOWN')='CONSIGNMENT' AND COALESCE(s."commissionRateOverride",CASE WHEN b.ownership='CONSIGNMENT' THEN b."commissionRate" END) IS NULL THEN 'COMMISSION_UNKNOWN' END,
    CASE WHEN COALESCE(s."supplierId",b."supplierId") IS NULL AND s."productKind" NOT IN ('SERVICE','GIFT_CARD') THEN 'SUPPLIER_UNKNOWN' END,
    CASE WHEN sup.id IS NOT NULL AND sup."termsVerifiedAt" IS NULL AND s."productKind" NOT IN ('SERVICE','GIFT_CARD') THEN 'SUPPLIER_TERMS_UNVERIFIED' END,
    CASE WHEN sup.id IS NOT NULL AND sup."leadTimeDays" IS NULL AND s."productKind" NOT IN ('SERVICE','GIFT_CARD') THEN 'SUPPLIER_LEAD_TIME_MISSING' END,
    CASE WHEN i."retailPrice" IS NULL AND i.quantity>0 AND s."productKind" NOT IN ('SERVICE','GIFT_CARD') THEN 'MISSING_PRICE' END,
    CASE WHEN i."inTransitVerifiedAt" IS NULL AND s."productKind" NOT IN ('SERVICE','GIFT_CARD') THEN 'IN_TRANSIT_UNKNOWN' END,
    CASE WHEN s."firstReceiptAt" IS NULL AND s."productKind" NOT IN ('SERVICE','GIFT_CARD') THEN 'MISSING_RECEIPT_DATE' END,
    CASE WHEN i.quantity<0 THEN 'NEGATIVE_STOCK' END,
    CASE WHEN s."firstReceiptAt">i."observedAt" THEN 'NEGATIVE_PRODUCT_AGE' END,
    CASE WHEN s."productKind"='UNKNOWN' THEN 'PRODUCT_KIND_UNVERIFIED' END,
    CASE WHEN EXISTS (SELECT 1 FROM (SELECT d."velocityPerWeek",d."weeksOnHand" FROM "SkuDaily" d WHERE d."tenantId"=s."tenantId" AND d."skuId"=s.id ORDER BY d."businessDate" DESC,d."calculatedAt" DESC LIMIT 1) d WHERE d."velocityPerWeek"<0 OR d."weeksOnHand"<0) THEN 'NEGATIVE_METRIC' END,
    CASE WHEN i.quantity IS NULL THEN 'STOCK_QUANTITY_UNAVAILABLE' END
   ],NULL) issues
 FROM "Sku" s JOIN latest i ON i."skuId"=s.id AND i."tenantId"=s."tenantId" LEFT JOIN "Brand" b ON b.id=COALESCE(s."brandId",${monoBrandId}) AND b."tenantId"=s."tenantId" LEFT JOIN "Supplier" sup ON sup.id=COALESCE(s."supplierId",b."supplierId") AND sup."tenantId"=s."tenantId" WHERE s."tenantId"=${tenantId}
)`;
}

/** Return bounded diagnostics and currency-separated components, not a replacement financial report. */
async function readProductQuality(
  tenantId: string,
  options: { page?: number; q?: string; code?: string } = {},
  db: SqlClient = prisma,
) {
  const currentClient = await readClientSettings(tenantId, db);
  const currentFilter = clientOrderFilterFingerprint(currentClient.values),
    defaultFilter = clientOrderFilterFingerprint(defaultClientSettings());
  const page = options.page ?? 1,
    search = options.q?.trim() ?? "";
  const base = qualityBase(
      tenantId,
      currentClient.values.profileMode === "MONOBRAND"
        ? currentClient.values.monoBrandId
        : null,
    ),
    filter = Prisma.sql`(${options.code ?? ""}='' OR ${options.code ?? ""}=ANY(issues)) AND (${search}='' OR sku ILIKE ${`%${search}%`} OR name ILIKE ${`%${search}%`})`;
  const [
    rows,
    total,
    summary,
    affectedStock,
    brands,
    aliases,
    components,
    stock,
    replay,
    orderExceptions,
  ] = await Promise.all([
    db.$queryRaw<
      Array<
        {
          id: string;
          sku: string;
          name: string;
          productKind: string;
          firstReceiptAt: Date | null;
          firstSaleAt: Date | null;
          observedAt: Date;
          issues: string[];
        } & Record<string, unknown>
      >
    >(
      Prisma.sql`${base} SELECT * FROM base WHERE ${filter} ORDER BY cardinality(issues) DESC,sku LIMIT 25 OFFSET ${(page - 1) * 25}`,
    ),
    db.$queryRaw<Array<{ n: number }>>(
      Prisma.sql`${base} SELECT count(*)::int n FROM base WHERE ${filter}`,
    ),
    db.$queryRaw<
      Array<{
        code: string;
        currency: string | null;
        skuCount: number;
        quantity: string | null;
        unknownQuantityCount: number;
        costValue: string | null;
        unknownValueCount: number;
      }>
    >(
      Prisma.sql`${base} SELECT q.code,b.currency,count(*)::int "skuCount",sum(CASE WHEN b.quantity>=0 THEN b.quantity END)::text quantity,count(*) FILTER (WHERE b.quantity IS NULL OR b.quantity<0)::int "unknownQuantityCount",sum(b."costValue")::text "costValue",count(*) FILTER (WHERE b."costValue" IS NULL)::int "unknownValueCount" FROM base b CROSS JOIN LATERAL unnest(b.issues) q(code) GROUP BY q.code,b.currency ORDER BY q.code,b.currency`,
    ),
    db.$queryRaw<
      Array<{
        currency: string | null;
        skuCount: number;
        quantity: string | null;
        costValue: string | null;
        unknownValueCount: number;
        unknownQuantityCount: number;
      }>
    >(
      Prisma.sql`${base} SELECT currency,count(*)::int "skuCount",sum(CASE WHEN quantity>=0 THEN quantity END)::text quantity,sum("costValue")::text "costValue",count(*) FILTER (WHERE "costValue" IS NULL)::int "unknownValueCount",count(*) FILTER (WHERE quantity IS NULL OR quantity<0)::int "unknownQuantityCount" FROM base WHERE cardinality(issues)>0 AND "productKind"='MERCHANDISE' GROUP BY currency ORDER BY currency`,
    ),
    db.$queryRaw<Array<{ id: string; name: string }>>(
      Prisma.sql`SELECT id,name FROM "Brand" WHERE "tenantId"=${tenantId} ORDER BY name LIMIT 500`,
    ),
    db.$queryRaw<
      Array<{ value: string; brandId: string; name: string; revision: number }>
    >(
      Prisma.sql`SELECT a.value,a."brandId",b.name,a.revision FROM "BrandAlias" a JOIN "Brand" b ON b.id=a."brandId" AND b."tenantId"=a."tenantId" WHERE a."tenantId"=${tenantId} ORDER BY a.value LIMIT 100`,
    ),
    db.$queryRaw<
      Array<{
        component: string;
        currency: string | null;
        lineCount: number;
        revenue: string | null;
        cost: string | null;
        missingAmountCount: number;
      }>
    >(Prisma.sql`SELECT
   CASE WHEN s."productKind"='GIFT_CARD' THEN 'GIFT_CARD' WHEN s."productKind"='SERVICE' THEN 'SERVICE' WHEN l.normalization->>'movement'='CORRECTION' OR l.kind='RETURN' THEN 'RETURNS_CORRECTIONS' WHEN s."productKind"='MERCHANDISE' THEN 'MERCHANDISE' ELSE 'UNKNOWN' END component,
   l.currency,count(*)::int "lineCount",sum(l."signedRevenue")::text revenue,sum(l."signedCost")::text cost,count(*) FILTER(WHERE l."signedRevenue" IS NULL)::int "missingAmountCount"
   FROM "OrderLine" l JOIN "ConnectorConnection" c ON c."sourceId"=l."sourceId" AND c."tenantId"=l."tenantId" LEFT JOIN "Sku" s ON s.id=l."skuId" AND s."tenantId"=l."tenantId"
   WHERE l."tenantId"=${tenantId} AND ${selectedConnection()} AND l."eventKey"='current' AND COALESCE((l.normalization->>'excluded')::boolean,false)=false AND l.kind IN ('SALE','RETURN','CORRECTION') GROUP BY component,l.currency ORDER BY component,l.currency`),
    db.$queryRaw<
      Array<{
        brandKey: string;
        currency: string | null;
        quantity: string | null;
        costValue: string | null;
      }>
    >(
      Prisma.sql`${base} SELECT "brandKey",currency,sum(CASE WHEN quantity>=0 THEN quantity END)::text quantity,sum("costValue")::text "costValue" FROM base WHERE "productKind"='MERCHANDISE' GROUP BY "brandKey",currency ORDER BY "brandKey",currency`,
    ),
    db.$queryRaw<Array<{ n: number }>>(
      Prisma.sql`SELECT count(*)::int n FROM "OrderLine" l JOIN "ConnectorConnection" c ON c."sourceId"=l."sourceId" AND c."tenantId"=l."tenantId" WHERE l."tenantId"=${tenantId} AND ${selectedConnection()} AND (l.normalization='{}'::jsonb OR COALESCE(l.normalization->>'filterFingerprint',${defaultFilter})<>${currentFilter})`,
    ),
    db.$queryRaw<
      Array<{
        code: string;
        sourceSku: string | null;
        orderId: string;
        lineId: string;
      }>
    >(Prisma.sql`SELECT q.code,l."sourceSku",l."externalOrderId" "orderId",l."externalLineId" "lineId" FROM "ImportIssue" q
    JOIN "OrderLine" l ON l."tenantId"=q."tenantId" AND l."importRunId"=q."importRunId" AND q."entityKey"='order:'||l."externalOrderId"||':'||l."externalLineId"
    JOIN "ConnectorConnection" c ON c."sourceId"=l."sourceId" AND c."tenantId"=l."tenantId" WHERE q."tenantId"=${tenantId} AND ${selectedConnection()} AND l."eventKey"='current' ORDER BY q."createdAt" DESC,q.id LIMIT 25`),
  ]);
  return {
    rows: rows.map((row) => ({
      ...row,
      eligibility: {
        ...productEligibility(row.productKind),
        repricing:
          row.productKind === "MERCHANDISE" &&
          row.retailPrice != null &&
          Number(row.retailPrice) > 0 &&
          row.quantity != null &&
          Number(row.quantity) > 0,
      },
      ageReference: productAgeReference(
        row.firstReceiptAt,
        row.firstSaleAt,
        row.observedAt,
      ),
    })),
    pagination: { page, pageSize: 25, totalRows: total[0].n },
    summary,
    affectedStock,
    brands,
    aliases,
    components,
    stock,
    orderExceptions,
    normalizationReplayRequired: replay[0].n,
  };
}

/** Keep grouped counts, distinct totals and SKU drill-downs on one consistent database snapshot. */
export async function getProductQuality(
  tenantId: string,
  options: { page?: number; q?: string; code?: string } = {},
  db: SqlClient = prisma,
) {
  if ("$transaction" in db && typeof db.$transaction === "function")
    return withCalculationSnapshot(db as SqlDatabase, (tx) =>
      readProductQuality(tenantId, options, tx),
    );
  return readProductQuality(tenantId, options, db);
}
