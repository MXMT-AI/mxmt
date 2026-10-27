import { readOrderHistory } from "./connectors/order-history";
import { readSelectedSource, mappingKey } from "./connectors/source";
import "server-only";
import { classifyDailySku, summarizeSkuClassification } from "./classify";
import { summarizeDailyBrands } from "./brand-metrics";
import {
  resolveMerchandisingPolicy,
  type PolicyInputs,
} from "./merchandising-policy";
import type { Ownership } from "./merchandising-settings";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { SqlDatabase, SqlClient } from "./connectors/database";
import { withCalculationSnapshot } from "./calculation-snapshot";
import { payloadHash } from "./connectors/order-storage";
import { inventoryPolicy } from "./connectors/inventory-normalization";
import { parseOrderPolicy } from "./connectors/order-policy";
import { readClientSettings } from "./merchandising-settings-store";
import { applyClientOrderSettings } from "./merchandising-order-policy";
import { trustedOrderProjectionSql } from "./order-projection-policy";
import { createOrderHistoryCoverage } from "./order-history";
import { resolveDailySkuPeriod } from "./sku-daily-period";
import {
  calculateDailySku,
  summarizeDailySkus,
  SKU_DAILY_CALCULATION_VERSION,
  type DailySkuInput,
} from "./sku-daily-metrics";
export class DailySkuError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
type AggregateInput = Omit<
  DailySkuInput,
  | "velocitySalesCovered"
  | "cohortSalesCovered"
  | "activitySalesCovered"
  | "receiptHistoryCovered"
  | "cogsHistoryCovered"
> &
  PolicyInputs & {
    brandName: string | null;
    brandOwnership: Ownership | null;
    snapshotRawKey: string | null;
    snapshotImportRunId: string | null;
  };
export interface DailySkuCalculation {
  calculationId: string;
  inputKey: string;
  calculationVersion: number;
  asOf: string;
  calculatedAt: string;
  rowCount: number;
  period: ReturnType<typeof resolveDailySkuPeriod>;
  summary: ReturnType<typeof summarizeDailySkus> &
    ReturnType<typeof summarizeSkuClassification>;
  brands: ReturnType<typeof summarizeDailyBrands>;
  provenance: {
    sourceId: string;
    configIds: string[];
    clientConfigId: string | null;
    orderThrough: string | null;
    sourceBusy: boolean;
    quarantinedOrders: number;
    unassignedOrderLines: number;
    receiptHistoryIsVerifiedEventsOnly: true;
    receiptHistoryComplete: boolean;
    receiptThrough: string | null;
    unassignedReceiptLines: number;
    historyBasis: string;
    inputHash: string;
  };
}
/** Persist a single atomic version of all daily SKU rows from the same source/config snapshot. */
export async function calculateSkuDaily(
  tenantId: string,
  input: { asOf?: string; now?: Date } = {},
  db: SqlDatabase = prisma,
): Promise<DailySkuCalculation> {
  return withCalculationSnapshot(db, (tx) =>
    calculateSkuDailyInSnapshot(tenantId, input, tx),
  );
}
/** Reuse an existing calculation transaction; the caller owns snapshot isolation. */
export async function calculateSkuDailyInSnapshot(
  tenantId: string,
  input: { asOf?: string; now?: Date },
  tx: SqlClient,
): Promise<DailySkuCalculation> {
  const source = await readSelectedSource(tenantId, tx);
  if (!source) throw new DailySkuError("SALESDRIVE_NOT_CONFIGURED");
  const period = resolveDailySkuPeriod(input.asOf, input.now, source.timezone),
    client = await readClientSettings(tenantId, tx);
  const configs = await tx.$queryRaw<
    Array<{ id: string; configType: string; key: string; values: unknown }>
  >(
    Prisma.sql`SELECT id,"configType",key,values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "isActive" AND "approvedAt" IS NOT NULL ORDER BY key,id`,
  );
  const mapping = configs.find(
    (c) =>
      c.configType === "SOURCE_MAPPING" && c.key === mappingKey(source.provider, source.id),
  );
  const basePolicy = mapping ? parseOrderPolicy(mapping.values) : {},
    policy = client.id
      ? applyClientOrderSettings(basePolicy, client.values, {
          id: client.id,
          revision: client.revision,
        })
      : basePolicy;
  const trusted = trustedOrderProjectionSql(policy, client.values);
  const [anchor] = await tx.$queryRaw<
    Array<{ id: string; quarantined: number }>
  >(
    Prisma.sql`SELECT r.id,COALESCE((j.stats->>'quarantined')::int,0) quarantined FROM "DataImportRun" r JOIN "ConnectorSyncJob" j ON j."importRunId"=r.id AND j."tenantId"=r."tenantId" AND j."sourceId"=r."sourceId" WHERE r."tenantId"=${tenantId} AND r."sourceId"=${source.id} AND r.status IN ('SUCCESS','WARNING') AND j.resource IN ('orders','csv') AND j.state='COMPLETE' ORDER BY r."completedAt" DESC,r.id DESC LIMIT 1`,
  );
  const { windows, cursor } = await readOrderHistory(tenantId, source.id, tx);
  if (windows.length > 1000)
    throw new DailySkuError("DAILY_HISTORY_LIMIT", 422);
  const [pending] = await tx.$queryRaw<Array<{ n: number }>>(
    Prisma.sql`SELECT count(*)::int n FROM "ConnectorSyncJob" WHERE "tenantId"=${tenantId} AND "sourceId"=${source.id} AND resource IN ('orders','inventory','catalog','receipts','csv') AND state NOT IN ('COMPLETE','CANCELLED')`,
  );
  const preorderGuard = Prisma.sql`NOT COALESCE(l."statusId"=33 AND ${basePolicy.statuses?.["33"] === "PREORDER"},false)`;
  const receiptPolicy = inventoryPolicy(mapping?.values),
    receiptPolicyHash = payloadHash(receiptPolicy);
  const [receiptState] = await tx.$queryRaw<
    Array<{
      through: string | null;
      policyHash: string | null;
      baseline: boolean;
      unassigned: number;
      invalid: boolean;
    }>
  >(Prisma.sql`SELECT c.checkpoint->>'through' through,c.checkpoint->>'policyHash' "policyHash",
      EXISTS(SELECT 1 FROM "ConnectorSyncJob" j JOIN "DataImportRun" r ON r.id=j."importRunId" AND r."tenantId"=j."tenantId" WHERE j."tenantId"=${tenantId} AND j."sourceId"=${source.id} AND (j.resource='inventory' OR (j.resource='csv' AND j.checkpoint->>'receiptBaseline'='true' AND j.checkpoint->>'receiptHistoryComplete'='true')) AND j.state='COMPLETE' AND r.status IN ('SUCCESS','WARNING') AND j.checkpoint->>'policyHash'=${receiptPolicyHash} AND (j.resource='csv' OR (NOT(j.checkpoint?'from') AND COALESCE((j.stats->>'pages')::int,0)>0)) AND NOT EXISTS(SELECT 1 FROM "ImportIssue" i WHERE i."tenantId"=j."tenantId" AND i."importRunId"=j."importRunId" AND i.code IN ('INVALID_RECEIPT_LINE','RECEIPT_VERSION_CONFLICT'))) baseline,
      (SELECT count(*)::int FROM "ReceiptLine" l JOIN "Receipt" r ON r.id=l."receiptId" AND r."tenantId"=l."tenantId" WHERE r."tenantId"=${tenantId} AND r."sourceId"=${source.id} AND r."movementType"='SUPPLIER_RECEIPT' AND r."postingVerifiedAt" IS NOT NULL AND r."receivedAt"<${period.cutoff}::timestamptz AND l.quantity>0 AND l."skuId" IS NULL) unassigned,
      EXISTS(SELECT 1 FROM "ImportIssue" i WHERE i."tenantId"=c."tenantId" AND i."importRunId"=c."lastSuccessfulRunId" AND i.code IN ('INVALID_RECEIPT_LINE','RECEIPT_VERSION_CONFLICT')) invalid
      FROM (SELECT 1) seed LEFT JOIN "SyncCursor" c ON c."tenantId"=${tenantId} AND c."sourceId"=${source.id} AND c.resource='receipts'`);
  const receiptPolicyCurrent = Boolean(
    receiptPolicy.receipts &&
      receiptState?.baseline &&
      receiptState.policyHash === receiptPolicyHash &&
      !receiptState.invalid &&
      receiptState.unassigned === 0,
  );
  const receiptHistoryCovered =
    receiptPolicyCurrent &&
    receiptState?.through != null &&
    Temporal.Instant.from(receiptState.through)
      .toZonedDateTimeISO(source.timezone)
      .toPlainDate()
      .toString() > period.windowTo;
  const eventAt = Prisma.sql`CASE WHEN l.kind='RETURN' THEN l."returnedAt" ELSE l."paidAt" END`;
  const [orderScope] = await tx.$queryRaw<
    Array<{ n: number; unassigned: number }>
  >(
    Prisma.sql`SELECT count(*)::int n,count(*) FILTER(WHERE l."skuId" IS NULL AND l.kind IN ('SALE','RETURN','CORRECTION') AND ${preorderGuard} AND (NOT COALESCE(${trusted},false) OR NOT COALESCE((l.normalization->>'excluded')::boolean,false)))::int unassigned FROM "OrderLine" l LEFT JOIN "ConnectorSyncJob" j ON j."importRunId"=l."importRunId" AND j."sourceId"=l."sourceId" AND j."tenantId"=l."tenantId" WHERE l."tenantId"=${tenantId} AND l."sourceId"=${source.id} AND l."eventKey"='current' AND (${eventAt}<${period.cutoff}::timestamptz OR ${eventAt} IS NULL)`,
  );
  if (orderScope.n > 500000) throw new DailySkuError("DAILY_INPUT_LIMIT", 422);
  const historyBlocked =
    !anchor ||
    pending.n > 0 ||
    (anchor?.quarantined ?? 0) > 0 ||
    orderScope.unassigned > 0;
  const history = createOrderHistoryCoverage(
    windows,
    cursor?.coverageThrough ?? null,
    source.timezone,
    historyBlocked,
  );
  const rows = await tx.$queryRaw<AggregateInput[]>(Prisma.sql`
   WITH products AS (
    SELECT s.id "skuId",s.sku,s.name,COALESCE(s."brandId",${client.values.profileMode === "MONOBRAND" ? client.values.monoBrandId : null}) "brandId",s."categoryId",s."productKind",b.name "brandName",b.ownership "brandOwnership",s."ownershipOverride",COALESCE(s."supplierId",b."supplierId") "supplierId",sup."leadTimeDays" "leadDays",(sup."termsVerifiedAt" IS NOT NULL) "supplierTermsVerified",COALESCE(c."seasonMonths",ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]) "seasonMonths",
     r."firstReceiptDate",r."lastReceiptDate",r."firstReceiptAt",r."receiptHash",snap.id "snapshotId",snap."observedAt"::text "observedAt",snap.quantity::text quantity,snap."costPrice"::text "costPrice",snap."retailPrice"::text "retailPrice",snap.currency,snap."sourceRecordKey" "snapshotRawKey",snap."importRunId" "snapshotImportRunId"
    FROM "Sku" s
    LEFT JOIN "Brand" b ON b.id=COALESCE(s."brandId",${client.values.profileMode === "MONOBRAND" ? client.values.monoBrandId : null}) AND b."tenantId"=s."tenantId"
    LEFT JOIN "Supplier" sup ON sup.id=COALESCE(s."supplierId",b."supplierId") AND sup."tenantId"=s."tenantId"
    LEFT JOIN "Category" c ON c.id=s."categoryId" AND c."tenantId"=s."tenantId"
    LEFT JOIN LATERAL (SELECT MIN(r."receivedAt") "firstReceiptAt",(MIN(r."receivedAt") AT TIME ZONE ${source.timezone})::date::text "firstReceiptDate",(MAX(r."receivedAt") AT TIME ZONE ${source.timezone})::date::text "lastReceiptDate",md5(string_agg(jsonb_build_array(r.id,r."importRunId",r."sourceRecordKey",r."receivedAt",rl.id,rl.quantity)::text,'|' ORDER BY r.id,rl.id)) "receiptHash"
     FROM "ReceiptLine" rl JOIN "Receipt" r ON r.id=rl."receiptId" AND r."tenantId"=rl."tenantId" WHERE rl."tenantId"=s."tenantId" AND rl."skuId"=s.id AND r."sourceId"=${source.id} AND r."movementType"='SUPPLIER_RECEIPT' AND ${receiptPolicyCurrent} AND r."postingVerifiedAt" IS NOT NULL AND rl.quantity>0 AND r."receivedAt"<${period.cutoff}::timestamptz) r ON true
    LEFT JOIN "InventorySnapshot" snap ON snap."tenantId"=s."tenantId" AND snap."skuId"=s.id AND snap."sourceId"=${source.id} AND snap."snapshotDate"=${period.asOf}::date AND snap."observedAt" IS NOT NULL AND snap."observedAt"<=${period.cutoff}::timestamptz AND (snap."observedAt" AT TIME ZONE ${source.timezone})::date=snap."snapshotDate" AND snap."importRunId" IS NOT NULL AND snap."sourceRecordKey" IS NOT NULL
    WHERE s."tenantId"=${tenantId} AND EXISTS(SELECT 1 FROM "SkuAlias" a WHERE a."tenantId"=s."tenantId" AND a."skuId"=s.id AND a."sourceId"=${source.id}) ORDER BY s.id LIMIT 20001
   )
   SELECT p.*,COALESCE(sh."observedDays",0) "observedDays",COALESCE(sh."inStockDays",0) "inStockDays",COALESCE(sh."invalidSnapshotDays",0) "invalidSnapshotDays",
    (o."lastSaleAt" AT TIME ZONE ${source.timezone})::date::text "lastSaleDate",COALESCE(o."netUnits12Weeks",0)::text "netUnits12Weeks",COALESCE(o."netUnitsSinceReceipt",0)::text "netUnitsSinceReceipt",COALESCE(o."cogs3Months",0)::text "cogs3Months",COALESCE(o."missingCostLines",0) "missingCostLines",COALESCE(o."currencyMismatch",false) "currencyMismatch",COALESCE(o."blockedOrderLines",0) "blockedOrderLines",
    md5(jsonb_build_array(p."receiptHash",p."snapshotRawKey",sh."historyHash",o."orderHash")::text) "inputHash"
   FROM products p
   LEFT JOIN LATERAL (SELECT count(*)::int "observedDays",count(*) FILTER(WHERE h.quantity>0)::int "inStockDays",count(*) FILTER(WHERE h.quantity IS NULL OR h.quantity<0)::int "invalidSnapshotDays",md5(string_agg(jsonb_build_array(h.id,h.quantity,h."observedAt",h."importRunId",h."sourceRecordKey")::text,'|' ORDER BY h."snapshotDate")) "historyHash"
    FROM "InventorySnapshot" h WHERE h."tenantId"=${tenantId} AND h."skuId"=p."skuId" AND h."sourceId"=${source.id} AND h."snapshotDate" BETWEEN ${period.windowFrom}::date AND ${period.windowTo}::date AND h."observedAt" IS NOT NULL AND h."observedAt"<=${period.cutoff}::timestamptz AND (h."observedAt" AT TIME ZONE ${source.timezone})::date=h."snapshotDate" AND h."importRunId" IS NOT NULL AND h."sourceRecordKey" IS NOT NULL) sh ON true
   LEFT JOIN LATERAL (
    WITH events AS (SELECT l.*,${eventAt} "eventAt",COALESCE(${trusted},false) trusted,NOT COALESCE((l.normalization->>'excluded')::boolean,false) AND NOT COALESCE((l.normalization->>'projectMappingUnavailable')::boolean,false) included
     FROM "OrderLine" l LEFT JOIN "ConnectorSyncJob" j ON j."importRunId"=l."importRunId" AND j."sourceId"=l."sourceId" AND j."tenantId"=l."tenantId" WHERE l."tenantId"=${tenantId} AND l."sourceId"=${source.id} AND l."skuId"=p."skuId" AND l."eventKey"='current' AND l.kind IN ('SALE','RETURN','CORRECTION') AND ${preorderGuard} AND (${eventAt}<${period.cutoff}::timestamptz OR ${eventAt} IS NULL))
    SELECT MAX("paidAt") FILTER(WHERE trusted AND included AND kind='SALE' AND "signedQuantity">0 AND normalization->>'movement'<>'CORRECTION') "lastSaleAt",
     SUM("signedQuantity") FILTER(WHERE trusted AND included AND ("eventAt" AT TIME ZONE ${source.timezone})::date BETWEEN ${period.windowFrom}::date AND ${period.windowTo}::date) "netUnits12Weeks",
     SUM("signedQuantity") FILTER(WHERE trusted AND included AND "eventAt">=p."firstReceiptAt" AND ("eventAt" AT TIME ZONE ${source.timezone})::date<=${period.windowTo}::date) "netUnitsSinceReceipt",
     SUM("signedCost") FILTER(WHERE trusted AND included AND ("eventAt" AT TIME ZONE ${source.timezone})::date BETWEEN ${period.cogsFrom}::date AND ${period.cogsTo}::date) "cogs3Months",
     count(*) FILTER(WHERE trusted AND included AND ("eventAt" AT TIME ZONE ${source.timezone})::date BETWEEN ${period.cogsFrom}::date AND ${period.cogsTo}::date AND ("signedCost" IS NULL OR "signedCost"=0 AND "signedQuantity"<>0))::int "missingCostLines",
     bool_or(currency IS DISTINCT FROM p.currency) FILTER(WHERE trusted AND included AND ("eventAt" AT TIME ZONE ${source.timezone})::date BETWEEN ${period.cogsFrom}::date AND ${period.cogsTo}::date) "currencyMismatch",
     count(*) FILTER(WHERE NOT trusted OR NOT COALESCE((normalization->>'excluded')::boolean,false) AND (COALESCE((normalization->>'projectMappingUnavailable')::boolean,false) OR "eventAt" IS NULL OR "signedQuantity" IS NULL))::int "blockedOrderLines",
     md5(string_agg(jsonb_build_array(id,"importRunId","sourceRecordKey","eventAt","signedQuantity","signedCost",currency,trusted,included)::text,'|' ORDER BY id)) "orderHash"
    FROM events
   ) o ON true ORDER BY p."skuId"`);
  if (rows.length > 20000) throw new DailySkuError("DAILY_SKU_LIMIT", 422);
  const receiptActivityCovered = rows.map((row) => ({
    ...row,
    receiptHistoryCovered,
    velocitySalesCovered: history.covers(period.windowFrom, period.windowTo),
    activitySalesCovered: history.covers(period.activityFrom, period.windowTo),
    cohortSalesCovered:
      row.firstReceiptDate !== null &&
      history.covers(row.firstReceiptDate, period.windowTo),
    cogsHistoryCovered: history.covers(period.cogsFrom, period.cogsTo),
  }));
  const metrics = receiptActivityCovered.map((row) => {
    const metric = calculateDailySku(row, {
      ...period,
      sourceBusy: pending.n > 0,
      turnoverNormMonths: client.values.turnoverMonths,
    });
    return {
      ...metric,
      ...classifyDailySku(
        metric,
        resolveMerchandisingPolicy(row, client.values),
      ),
      brandName: row.brandName,
      brandOwnership: row.brandOwnership ?? ("UNKNOWN" as const),
    };
  });
  const inputHash = payloadHash(rows),
    inputKey = payloadHash({
      version: SKU_DAILY_CALCULATION_VERSION,
      asOf: period.asOf,
      windowFrom: period.windowFrom,
      cogsFrom: period.cogsFrom,
      cogsTo: period.cogsTo,
      sourceId: source.id,
      timezone: source.timezone,
      client: client.values,
      configs,
      inputHash,
      historySpans: history.spans,
      historyBlocked,
      receiptHistoryCovered,
      receiptPolicyHash,
      receiptThrough: receiptState?.through ?? null,
      quarantinedOrders: anchor?.quarantined ?? 0,
      unassignedOrderLines: orderScope.unassigned,
      orderThrough: cursor?.through ?? null,
    });
  const key = `calculation:sku-daily:${source.id}:${period.asOf}:${inputKey}`;
  const [cached] = await tx.$queryRaw<
    Array<{ id: string; values: { calculation: DailySkuCalculation } }>
  >(
    Prisma.sql`SELECT id,values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "configType"='GENERAL' AND key=${key} AND revision=1`,
  );
  if (cached) return cached.values.calculation;
  const calculation: DailySkuCalculation = {
    calculationId: randomUUID(),
    inputKey,
    calculationVersion: SKU_DAILY_CALCULATION_VERSION,
    asOf: period.asOf,
    calculatedAt: new Date().toISOString(),
    rowCount: metrics.length,
    period,
    summary: {
      ...summarizeDailySkus(metrics, client.values.turnoverMonths),
      ...summarizeSkuClassification(metrics),
    },
    brands: summarizeDailyBrands(
      metrics,
      resolveMerchandisingPolicy({}, client.values),
    ),
    provenance: {
      sourceId: source.id,
      configIds: configs.map((c) => c.id),
      clientConfigId: client.id,
      orderThrough: cursor?.through ?? null,
      sourceBusy: pending.n > 0,
      quarantinedOrders: anchor?.quarantined ?? 0,
      unassignedOrderLines: orderScope.unassigned,
      receiptHistoryIsVerifiedEventsOnly: true,
      receiptHistoryComplete: receiptHistoryCovered,
      receiptThrough: receiptState?.through ?? null,
      unassignedReceiptLines: receiptState?.unassigned ?? 0,
      historyBasis: "COMPLETED_CREATION_WINDOWS_AND_OBSERVED_STOCK_DAYS",
      inputHash,
    },
  };
  await tx.$executeRaw(
    Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive") VALUES (${calculation.calculationId},${tenantId},'GENERAL',${key},1,${JSON.stringify({ kind: "SKU_DAILY_INPUTS_V1", calculation })}::jsonb,false) ON CONFLICT ("tenantId","configType",key,revision) DO NOTHING`,
  );
  const [manifest] = await tx.$queryRaw<
    Array<{ id: string; values: { calculation: DailySkuCalculation } }>
  >(
    Prisma.sql`SELECT id,values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "configType"='GENERAL' AND key=${key} AND revision=1`,
  );
  if (manifest.id !== calculation.calculationId)
    return manifest.values.calculation;
  for (let offset = 0; offset < metrics.length; offset += 200) {
    const batch = metrics
      .slice(offset, offset + 200)
      .map(
        (row, index) =>
          Prisma.sql`(${randomUUID()},${tenantId},${row.skuId},${period.asOf}::date,${calculation.calculationId},${SKU_DAILY_CALCULATION_VERSION},${JSON.stringify({ sourceId: source.id, inputKey, inputHash: rows[offset + index]?.inputHash ?? null, sourceObservedAt: row.sourceObservedAt, snapshotId: row.snapshotId, snapshotRawKey: rows[offset + index]?.snapshotRawKey ?? null, snapshotImportRunId: rows[offset + index]?.snapshotImportRunId ?? null })}::jsonb,${row.currency},${row.velocityPerWeek}::numeric,${row.weeksOnHand}::numeric,${row.quantity}::numeric,${row.stockCostValue}::numeric,${row.stockRetailValue}::numeric,${row.daysToZero}::numeric,${row.sellThroughRatio}::numeric,${row.active},${row.classification},${JSON.stringify(row)}::jsonb,${JSON.stringify(row.diagnostics)}::jsonb)`,
      );
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "SkuDaily" (id,"tenantId","skuId","businessDate","configId","calculationVersion","inputProvenance",currency,"velocityPerWeek","weeksOnHand",quantity,"stockCostValue","stockRetailValue","daysToZero","sellThroughRatio",active,classification,metrics,diagnostics) VALUES ${Prisma.join(batch)} ON CONFLICT ("tenantId","skuId","businessDate","configId","calculationVersion") DO NOTHING`,
    );
  }
  return calculation;
}

export const DAILY_SKU_SORTS = [
  "sku",
  "velocityPerWeek",
  "weeksOnHand",
  "daysToZero",
  "sellThroughRatio",
] as const;
export interface DailySkuQuery {
  page: number;
  pageSize: number;
  q: string;
  sort: (typeof DAILY_SKU_SORTS)[number];
  direction: "asc" | "desc";
}
/** Read exactly one frozen calculation, with tenant scope applied to manifest and SKU rows. */
export async function readSkuDaily(
  tenantId: string,
  calculationId: string,
  query: DailySkuQuery,
  db: SqlClient = prisma,
) {
  if (
    !DAILY_SKU_SORTS.includes(query.sort) ||
    !["asc", "desc"].includes(query.direction)
  )
    throw new DailySkuError("INVALID_DAILY_QUERY", 400);
  const [manifest] = await db.$queryRaw<
    Array<{ values: { calculation: DailySkuCalculation } }>
  >(
    Prisma.sql`SELECT values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND id=${calculationId} AND "configType"='GENERAL' AND values->>'kind'='SKU_DAILY_INPUTS_V1'`,
  );
  if (!manifest) throw new DailySkuError("DAILY_CALCULATION_NOT_FOUND", 404);
  const filter = Prisma.sql`d."tenantId"=${tenantId} AND d."configId"=${calculationId} AND (d.metrics->>'sku' ILIKE ${"%" + query.q + "%"} OR d.metrics->>'name' ILIKE ${"%" + query.q + "%"})`;
  const column =
      query.sort === "sku"
        ? Prisma.sql`d.metrics->>'sku'`
        : Prisma.raw(`d."${query.sort}"`),
    direction = Prisma.raw(query.direction === "desc" ? "DESC" : "ASC");
  const [counts, rows] = await Promise.all([
    db.$queryRaw<Array<{ n: number }>>(
      Prisma.sql`SELECT count(*)::int n FROM "SkuDaily" d JOIN "Sku" s ON s.id=d."skuId" AND s."tenantId"=d."tenantId" WHERE ${filter}`,
    ),
    db.$queryRaw<Array<{ metrics: unknown }>>(
      Prisma.sql`SELECT d.metrics FROM "SkuDaily" d JOIN "Sku" s ON s.id=d."skuId" AND s."tenantId"=d."tenantId" WHERE ${filter} ORDER BY ${column} ${direction} NULLS LAST,d."skuId" LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
    ),
  ]);
  return {
    ...manifest.values.calculation,
    rows: rows.map((r) => r.metrics),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      totalRows: counts[0].n,
      totalPages: Math.ceil(counts[0].n / query.pageSize),
    },
  };
}
