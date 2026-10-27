import { readSelectedSource } from "./connectors/source";
import "server-only";
import { Temporal } from "@js-temporal/polyfill";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { SqlClient, SqlDatabase } from "./connectors/database";
import { payloadHash } from "./connectors/order-storage";
import { withCalculationSnapshot } from "./calculation-snapshot";
import { getSalesReportInSnapshot, SalesReportError } from "./sales-report";
import { calculateSkuDailyInSnapshot } from "./sku-daily-store";
import { resolveSalesPeriod } from "./sales-period";
import {
  isEligibleSalesFact,
  inSalesPeriod,
  salesFactProfit,
  type SalesFact,
  type SalesMetricContext,
} from "./sales-metrics";
import {
  resolveMerchandisingPolicy,
  type PolicyInputs,
} from "./merchandising-policy";
export const SCREEN_MODEL_VERSION = 2;
export class ScreenApiError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
export interface ScreenSourceState {
  timezone: string;
  selectionRevision?: number;
  selected?: boolean;
  orderThrough: string | null;
  configIds: string[];
  cursorState: unknown;
  recalculationRequestedAt: string | null;
  pending: number;
}
export interface ScreenSnapshot {
  snapshotId: string;
  modelVersion: number;
  createdAt: string;
  sourceId: string;
  sales: {
    calculationId: string;
    inputKey: string;
    calculationVersion: number;
    context: SalesMetricContext;
    currencies: Array<string | null>;
    issues: Array<{ code: string; count: number }>;
  };
  stock: {
    calculationId: string;
    inputKey: string;
    calculationVersion: number;
    asOf: string;
    cutoff: string;
    rowCount: number;
    issues: Array<{ code: string; count: number }>;
  };
  settings: { clientConfigId: string | null; configIds: string[] };
  sourceState: ScreenSourceState;
  sourceStateKey: string;
  trend?: { calculationId: string; context: SalesMetricContext };
  trendUnavailableReason?: "INPUT_LIMIT";
}
/** Only provenance/freshness is live. Navigation never reads mutable facts or catalog values. */
export async function readScreenSourceState(
  tenantId: string,
  sourceId: string,
  tx: SqlClient,
): Promise<ScreenSourceState | null> {
  const [row] = await tx.$queryRaw<
    ScreenSourceState[]
  >(Prisma.sql`SELECT s.timezone,
 (SELECT checkpoint->>'through' FROM "SyncCursor" WHERE "tenantId"=s."tenantId" AND "sourceId"=s.id AND resource='orders') "orderThrough",
 COALESCE((SELECT jsonb_agg(id ORDER BY key,id) FROM "MerchandisingConfig" WHERE "tenantId"=s."tenantId" AND "isActive" AND "approvedAt" IS NOT NULL),'[]') "configIds",
 COALESCE((SELECT jsonb_agg(jsonb_build_array(resource,checkpoint,"lastSuccessfulRunId") ORDER BY resource) FROM "SyncCursor" WHERE "tenantId"=s."tenantId" AND "sourceId"=s.id),'[]') "cursorState",
 (SELECT max("requestedAt")::text FROM "ConnectorRecalculation" WHERE "tenantId"=s."tenantId" AND "sourceId"=s.id) "recalculationRequestedAt",
 (SELECT count(*)::int FROM "ConnectorSyncJob" WHERE "tenantId"=s."tenantId" AND "sourceId"=s.id AND state<>'COMPLETE') pending
 FROM "DataSource" s WHERE s."tenantId"=${tenantId} AND s.id=${sourceId}`);
  if (!row) return null;
  const selected = await readSelectedSource(tenantId, tx);
  return {...row, selectionRevision: selected?.revision ?? 0, selected: selected?.id===sourceId};
}
export function screenSourceKey(state: ScreenSourceState | null) {
  return payloadHash(
    state && {
      ...(state.selectionRevision ? {selectionRevision:state.selectionRevision} : {}),
      ...(state.selected===false ? {selected:false} : {}),
      configIds: state.configIds,
      cursorState: state.cursorState,
      recalculationRequestedAt: state.recalculationRequestedAt,
    },
  );
}
export async function createScreenSnapshot(
  tenantId: string,
  input: { dateFrom?: string; dateTo?: string; asOf?: string; now?: Date } = {},
  db: SqlDatabase = prisma,
): Promise<ScreenSnapshot> {
  const now = input.now ?? new Date(),
    period = resolveSalesPeriod({ ...input, now });
  return withCalculationSnapshot(db, async (tx) => {
    let facts: SalesFact[] = [],
      context: SalesMetricContext | undefined;
    const sales = await getSalesReportInSnapshot(
      tenantId,
      period,
      tx,
      (f, c) => {
        facts = f;
        context = c;
      },
    );
    let trendFacts: SalesFact[] = [],
      trendContext: SalesMetricContext | undefined;
    const trendPeriod = resolveSalesPeriod({
      dateFrom: period.to.slice(0, 4) + "-01-01",
      dateTo: period.to,
      now,
    });
    let trendUnavailableReason: "INPUT_LIMIT" | undefined;
    let trend = await getSalesReportInSnapshot(
      tenantId,
      trendPeriod,
      tx,
      (f, c) => {
        trendFacts = f;
        trendContext = c;
      },
    ).catch((error: unknown) => {
      if (
        error instanceof SalesReportError &&
        error.code === "SALES_INPUT_LIMIT"
      ) {
        trendFacts = [];
        trendContext = undefined;
        trendUnavailableReason = "INPUT_LIMIT";
        return null;
      }
      throw error;
    });
    const stock = await calculateSkuDailyInSnapshot(
      tenantId,
      { asOf: input.asOf, now },
      tx,
    );
    if (
      !context ||
      (trend &&
        (!trendContext ||
          trend.provenance.sourceId !== sales.provenance.sourceId ||
          payloadHash(trend.provenance.configIds) !==
            payloadHash(sales.provenance.configIds))) ||
      sales.provenance.sourceId !== stock.provenance.sourceId ||
      sales.provenance.clientConfigId !== stock.provenance.clientConfigId ||
      payloadHash(sales.provenance.configIds) !==
        payloadHash(stock.provenance.configIds)
    )
      throw new ScreenApiError("INCONSISTENT_SCREEN_INPUTS");
    const trendLyEnd = Temporal.PlainDate.from(trendPeriod.lyTo);
    const fullTrendLyTo = trendLyEnd
      .with({ day: trendLyEnd.daysInMonth })
      .toString();
    const lyEnd = Temporal.PlainDate.from(period.lyTo);
    const fullLyTo = lyEnd.with({ day: lyEnd.daysInMonth }).toString();
    const selectFacts = (supporting: boolean) => {
      const eligible = [
        ...new Map(
          [...facts, ...(supporting ? trendFacts : [])].map((f) => [f.id, f]),
        ).values(),
      ].filter(
        (f) =>
          isEligibleSalesFact(f) ||
          (!f.excluded &&
            !f.stale &&
            !f.projectMappingUnavailable &&
            f.kind === "PREORDER"),
      );
      return eligible
        .map((f) => ({ f, date: f.kind === "PREORDER" ? f.paidDate : f.date }))
        .filter(
          ({ date }) =>
            inSalesPeriod(date, period.from, period.to) ||
            inSalesPeriod(date, period.lyFrom, period.lyTo) ||
            (supporting &&
              (inSalesPeriod(date, trendPeriod.from, trendPeriod.to) ||
                inSalesPeriod(date, trendPeriod.lyFrom, fullTrendLyTo) ||
                inSalesPeriod(
                  date,
                  period.lyFrom.slice(0, 7) + "-01",
                  fullLyTo,
                ))),
        );
    };
    let selected = selectFacts(Boolean(trend));
    if (trend && selected.length > 100000) {
      trend = null;
      trendContext = undefined;
      trendFacts = [];
      trendUnavailableReason = "INPUT_LIMIT";
      selected = selectFacts(false);
    }
    if (selected.length > 100000)
      throw new ScreenApiError("SCREEN_INPUT_LIMIT", 422);
    const state = await readScreenSourceState(
      tenantId,
      sales.provenance.sourceId,
      tx,
    );
    if (!state) throw new ScreenApiError("SOURCE_NOT_AVAILABLE");
    const sourceStateKey = screenSourceKey(state),
      key = `calculation:screens:${payloadHash({ version: SCREEN_MODEL_VERSION, sales: sales.calculationRunId, stock: stock.calculationId, trend: trend?.calculationRunId ?? null, sourceStateKey })}`;
    const [cached] = await tx.$queryRaw<
      Array<{ values: { snapshot: ScreenSnapshot } }>
    >(
      Prisma.sql`SELECT values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "configType"='GENERAL' AND key=${key} AND revision=1`,
    );
    if (cached) return cached.values.snapshot;
    const snapshot: ScreenSnapshot = {
      snapshotId: randomUUID(),
      modelVersion: SCREEN_MODEL_VERSION,
      createdAt: now.toISOString(),
      sourceId: sales.provenance.sourceId,
      sales: {
        calculationId: sales.calculationRunId,
        inputKey: sales.inputKey,
        calculationVersion: sales.calculationVersion,
        context,
        currencies: sales.summary.map((r) => r.currency),
        issues: sales.issues.map((i) => ({ code: i.code, count: i.count })),
      },
      stock: {
        calculationId: stock.calculationId,
        inputKey: stock.inputKey,
        calculationVersion: stock.calculationVersion,
        asOf: stock.asOf,
        cutoff: stock.period.cutoff,
        rowCount: stock.rowCount,
        issues: [
          ...(stock.provenance.sourceBusy
            ? [{ code: "SOURCE_BUSY", count: 1 }]
            : []),
          ...(stock.provenance.quarantinedOrders
            ? [
                {
                  code: "IMPORT_QUARANTINED",
                  count: stock.provenance.quarantinedOrders,
                },
              ]
            : []),
        ],
      },
      settings: {
        clientConfigId: sales.provenance.clientConfigId,
        configIds: sales.provenance.configIds,
      },
      sourceState: state,
      sourceStateKey,
      ...(trend && trendContext
        ? {
            trend: {
              calculationId: trend.calculationRunId,
              context: trendContext,
            },
          }
        : {}),
      ...(trendUnavailableReason ? { trendUnavailableReason } : {}),
    };
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive") VALUES (${snapshot.snapshotId},${tenantId},'GENERAL',${key},1,${JSON.stringify({ kind: "SCREEN_SNAPSHOT_V1", snapshot })}::jsonb,false) ON CONFLICT ("tenantId","configType",key,revision) DO NOTHING`,
    );
    const [published] = await tx.$queryRaw<
      Array<{ values: { snapshot: ScreenSnapshot } }>
    >(
      Prisma.sql`SELECT values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "configType"='GENERAL' AND key=${key} AND revision=1`,
    );
    if (published.values.snapshot.snapshotId !== snapshot.snapshotId)
      return published.values.snapshot;
    for (let offset = 0; offset < selected.length; offset += 300) {
      const values = selected
        .slice(offset, offset + 300)
        .map(
          ({ f, date }) =>
            Prisma.sql`(${snapshot.snapshotId},${tenantId},${f.id},${f.sourceId},${f.orderId},${f.skuId},${f.sku},${f.name},${f.brandId},${f.brand},${f.categoryId},${f.category},${f.channelId},${f.channel},${f.currency},${f.productKind},${f.kind},${inSalesPeriod(date, period.from, period.to)},${inSalesPeriod(date, period.lyFrom, period.lyTo)},${date}::date,${Boolean(trend)},${f.revenue}::numeric,${f.quantity}::numeric,${f.kind === "PREORDER" ? null : (salesFactProfit(f)?.toString() ?? null)}::numeric)`,
        );
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "MerchandisingScreenFact" ("snapshotId","tenantId","lineId","sourceId","orderId","skuId",sku,name,"brandId","brandName","categoryId","categoryName","channelId","channelName",currency,"productKind",kind,"inCurrent","inPriorYear","businessDate","isSupporting",revenue,quantity,"grossProfit") VALUES ${Prisma.join(values)}`,
      );
    }
    const extras = await tx.$queryRaw<
      Array<
        PolicyInputs & {
          dailyId: string;
          skuId: string;
          barcode: string | null;
          categoryName: string | null;
          supplierName: string | null;
          unitCost: string | null;
          retailPrice: string | null;
          inTransitQuantity: number | null;
        }
      >
    >(Prisma.sql`
   SELECT d.id "dailyId",d."skuId",s.barcode,c.name "categoryName",sup.name "supplierName",snap."costPrice"::text "unitCost",snap."retailPrice"::text "retailPrice",
    CASE WHEN snap."inTransitVerifiedAt" IS NOT NULL AND snap."inTransitVerifiedAt"<=${stock.period.cutoff}::timestamptz THEN snap."qtyInTransit" ELSE NULL END "inTransitQuantity",
    s."ownershipOverride",s."commissionRateOverride"::text "commissionRateOverride",b.ownership "brandOwnership",b."commissionRate"::text "brandCommissionRate",COALESCE(s."supplierId",b."supplierId") "supplierId",sup."leadTimeDays" "leadDays",sup."coverDays",sup.moq,(sup."termsVerifiedAt" IS NOT NULL) "supplierTermsVerified"
   FROM "SkuDaily" d JOIN "Sku" s ON s.id=d."skuId" AND s."tenantId"=d."tenantId"
   LEFT JOIN "Brand" b ON b.id=d.metrics->>'brandId' AND b."tenantId"=d."tenantId"
   LEFT JOIN "Category" c ON c.id=d.metrics->>'categoryId' AND c."tenantId"=d."tenantId"
   LEFT JOIN "Supplier" sup ON sup.id=COALESCE(s."supplierId",b."supplierId") AND sup."tenantId"=d."tenantId"
   LEFT JOIN "InventorySnapshot" snap ON snap.id=d.metrics->>'snapshotId' AND snap."tenantId"=d."tenantId"
   WHERE d."tenantId"=${tenantId} AND d."configId"=${stock.calculationId} AND d."calculationVersion"=${stock.calculationVersion} ORDER BY d."skuId"`);
    if (extras.length !== stock.rowCount)
      throw new ScreenApiError("INCOMPLETE_DAILY_PUBLICATION");
    for (let offset = 0; offset < extras.length; offset += 300) {
      const values = extras.slice(offset, offset + 300).map((row) => {
        const policy = resolveMerchandisingPolicy(row, context!.settings);
        const details = {
          categoryName: row.categoryName,
          supplierName: row.supplierName,
          barcode: row.barcode,
          unitCost: row.unitCost,
          retailPrice: row.retailPrice,
          inTransitQuantity: row.inTransitQuantity,
          policy,
        };
        return Prisma.sql`(${snapshot.snapshotId},${tenantId},${row.skuId},${row.dailyId},${JSON.stringify(details)}::jsonb)`;
      });
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "MerchandisingScreenSku" ("snapshotId","tenantId","skuId","dailyId",details) VALUES ${Prisma.join(values)}`,
      );
    }
    return snapshot;
  });
}
export async function readScreenSnapshot(
  tenantId: string,
  id: string,
  db: SqlClient = prisma,
): Promise<ScreenSnapshot> {
  const [row] = await db.$queryRaw<
    Array<{ values: { snapshot: ScreenSnapshot } }>
  >(
    Prisma.sql`SELECT values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND id=${id} AND "configType"='GENERAL' AND values->>'kind'='SCREEN_SNAPSHOT_V1'`,
  );
  if (!row) throw new ScreenApiError("SCREEN_SNAPSHOT_NOT_FOUND", 404);
  const snapshot = row.values.snapshot;
  if (
    ![1, SCREEN_MODEL_VERSION].includes(snapshot.modelVersion) ||
    snapshot.sales.calculationVersion !== 1 ||
    snapshot.stock.calculationVersion !== 2
  )
    throw new ScreenApiError("SCREEN_VERSION_UNSUPPORTED");
  return snapshot;
}
