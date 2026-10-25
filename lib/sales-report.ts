import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Temporal } from "@js-temporal/polyfill";
import { prisma } from "./prisma";
import type { SqlDatabase } from "./connectors/database";
import { payloadHash } from "./connectors/order-storage";
import { parseOrderPolicy } from "./connectors/order-policy";
import { readClientSettings } from "./merchandising-settings-store";
import {
  resolveMerchandisingPolicy,
  type PolicyInputs,
} from "./merchandising-policy";
import {
  applyClientOrderSettings,
  clientOrderFilterFingerprint,
} from "./merchandising-order-policy";
import { resolveSalesPeriod, type SalesPeriod } from "./sales-period";
import { SALES_CALCULATION_VERSION, type SalesFact } from "./sales-metrics";
import {
  calculateSalesReport,
  type SalesReport,
} from "./sales-report-calculation";
export class SalesReportError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
type InputRow = SalesFact &
  PolicyInputs & {
    importRunId: string;
    sourceRecordKey: string;
    importFilter: string | null;
    importPolicy: unknown;
    normalizationVersion: string | null;
    movement: string | null;
    preorderAmount: string | null;
    preorderQuantity: string;
  };
export interface PublishedSalesReport extends SalesReport {
  calculationRunId: string;
  inputKey: string;
  calculatedAt: string;
  provenance: {
    sourceId: string;
    clientConfigId: string | null;
    configIds: string[];
    importRunIds: string[];
    factCount: number;
    factHash: string;
    historyBasis: string;
    sourceBusy: boolean;
  };
}
function policyKey(value: unknown) {
  const p = parseOrderPolicy(value);
  return payloadHash({
    statuses: p.statuses ?? {},
    amounts: p.amounts ?? null,
    dates: p.dates ?? null,
  });
}
/** Explicit coverage is based on the imported creation window, not earliest/latest sale heuristics. */
export function salesHistoryCoverage(
  windows: Array<{ from: string; to: string }>,
  through: string | null,
  period: SalesPeriod,
  timezone: string,
  busy: boolean,
) {
  const zoned = (v: string) =>
    Temporal.Instant.from(v).toZonedDateTimeISO(timezone);
  const completedThrough = (v: string) => {
    const t = zoned(v);
    return (
      Temporal.PlainTime.compare(
        t.toPlainTime(),
        Temporal.PlainTime.from("23:59:59.999"),
      ) >= 0
        ? t.toPlainDate()
        : t.toPlainDate().subtract({ days: 1 })
    ).toString();
  };
  const sorted = windows
    .map((w) => {
      const from = zoned(w.from);
      return {
        from: (Temporal.PlainTime.compare(
          from.toPlainTime(),
          Temporal.PlainTime.from("00:00"),
        ) === 0
          ? from.toPlainDate()
          : from.toPlainDate().add({ days: 1 })
        ).toString(),
        to: completedThrough(w.to),
      };
    })
    .sort((a, b) => a.from.localeCompare(b.from));
  const spans: Array<{ from: string; to: string }> = [];
  for (const w of sorted) {
    const previous = spans.at(-1);
    if (
      previous &&
      Temporal.PlainDate.compare(
        Temporal.PlainDate.from(previous.to).add({ days: 1 }),
        Temporal.PlainDate.from(w.from),
      ) >= 0
    ) {
      if (w.to > previous.to) previous.to = w.to;
    } else spans.push({ ...w });
  }
  if (through && spans.length) {
    const end = completedThrough(through);
    if (end > spans.at(-1)!.to) spans.at(-1)!.to = end;
  }
  const covers = (from: string, to: string) =>
    !busy && spans.some((s) => s.from <= from && s.to >= to);
  return {
    current: covers(period.from, period.to),
    ly: covers(period.lyFrom, period.lyTo),
  };
}
/** Freeze inputs in one database snapshot and publish all financial views atomically. */
export async function getSalesReport(
  tenantId: string,
  input: { dateFrom?: string; dateTo?: string; now?: Date } = {},
  db: SqlDatabase = prisma,
): Promise<PublishedSalesReport> {
  const period = resolveSalesPeriod(input);
  const calculate = () =>
    db.$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`,
        );
        const [source] = await tx.$queryRaw<
          Array<{ id: string; timezone: string }>
        >(
          Prisma.sql`SELECT s.id,s.timezone FROM "DataSource" s JOIN "ConnectorConnection" c ON c."sourceId"=s.id AND c."tenantId"=s."tenantId" WHERE s."tenantId"=${tenantId} AND c.provider='salesdrive' AND s.kind='SALESDRIVE'`,
        );
        if (!source) throw new SalesReportError("SALESDRIVE_NOT_CONFIGURED");
        const client = await readClientSettings(tenantId, tx);
        const configs = await tx.$queryRaw<
          Array<{
            id: string;
            configType: string;
            key: string;
            values: unknown;
          }>
        >(
          Prisma.sql`SELECT id,"configType",key,values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "isActive" AND "approvedAt" IS NOT NULL ORDER BY key,id`,
        );
        const mapping = configs.find(
          (c) =>
            c.configType === "SOURCE_MAPPING" &&
            c.key === `salesdrive:${source.id}`,
        );
        const sourcePolicy = mapping ? parseOrderPolicy(mapping.values) : {};
        const activePolicy = client.id
          ? applyClientOrderSettings(sourcePolicy, client.values, {
              id: client.id,
              revision: client.revision,
            })
          : sourcePolicy;
        const currentPolicyKey = policyKey(activePolicy),
          filterKey = clientOrderFilterFingerprint(client.values);
        const [anchor] = await tx.$queryRaw<
          Array<{ id: string; quarantined: number }>
        >(
          Prisma.sql`SELECT r.id,COALESCE((j.stats->>'quarantined')::int,0) quarantined FROM "DataImportRun" r JOIN "ConnectorSyncJob" j ON j."importRunId"=r.id AND j."tenantId"=r."tenantId" AND j."sourceId"=r."sourceId" WHERE r."tenantId"=${tenantId} AND r."sourceId"=${source.id} AND r.status IN ('SUCCESS','WARNING') AND j.state='COMPLETE' AND j.resource='orders' ORDER BY r."completedAt" DESC,r.id DESC LIMIT 1`,
        );
        if (!anchor) throw new SalesReportError("SALES_IMPORT_NOT_READY");
        const windows = await tx.$queryRaw<Array<{ from: string; to: string }>>(
          Prisma.sql`SELECT j.checkpoint->>'from' "from",j.checkpoint->>'to' "to" FROM "ConnectorSyncJob" j JOIN "DataImportRun" r ON r.id=j."importRunId" AND r."tenantId"=j."tenantId" WHERE j."tenantId"=${tenantId} AND j."sourceId"=${source.id} AND j.resource='orders' AND j.mode='BACKFILL' AND j.state='COMPLETE' AND r.status IN ('SUCCESS','WARNING') ORDER BY j."createdAt" LIMIT 1001`,
        );
        if (windows.length > 1000)
          throw new SalesReportError("SALES_HISTORY_LIMIT", 422);
        const [cursor] = await tx.$queryRaw<Array<{ through: string | null }>>(
          Prisma.sql`SELECT checkpoint->>'through' through FROM "SyncCursor" WHERE "tenantId"=${tenantId} AND "sourceId"=${source.id} AND resource='orders'`,
        );
        const [pending] = await tx.$queryRaw<Array<{ n: number }>>(
          Prisma.sql`SELECT count(*)::int n FROM "ConnectorSyncJob" WHERE "tenantId"=${tenantId} AND "sourceId"=${source.id} AND resource IN ('orders','catalog') AND state<>'COMPLETE'`,
        );
        const lyMonthFrom = Temporal.PlainDate.from(period.lyFrom)
          .with({ day: 1 })
          .toString();
        const lyEnd = Temporal.PlainDate.from(period.lyTo),
          lyMonthTo = lyEnd.with({ day: lyEnd.daysInMonth }).toString();
        const withinWindows = (column: Prisma.Sql) =>
          Prisma.sql`((${column}>=(${period.from}::date::timestamp AT TIME ZONE ${source.timezone}) AND ${column}<((${period.to}::date+1)::timestamp AT TIME ZONE ${source.timezone})) OR (${column}>=(${lyMonthFrom}::date::timestamp AT TIME ZONE ${source.timezone}) AND ${column}<((${lyMonthTo}::date+1)::timestamp AT TIME ZONE ${source.timezone})))`;
        const rows = await tx.$queryRaw<
          InputRow[]
        >(Prisma.sql`SELECT l.id,l."sourceId",l."externalOrderId" "orderId",l."skuId",COALESCE(s.sku,l."sourceSku") sku,s.name,b.id "brandId",b.name brand,cat.id "categoryId",cat.name category,l."channelId",l."channelId" channel,COALESCE(s."productKind",'UNKNOWN') "productKind",s."ownershipOverride",s."commissionRateOverride"::text "commissionRateOverride",b.ownership "brandOwnership",b."commissionRate"::text "brandCommissionRate",l.kind,l."statusId",
   ((CASE WHEN l.kind='RETURN' THEN l."returnedAt" ELSE l."paidAt" END) AT TIME ZONE ${source.timezone})::date::text date,(l."paidAt" AT TIME ZONE ${source.timezone})::date::text "paidDate",l."signedRevenue"::text revenue,l."signedCost"::text cost,l."signedQuantity"::text quantity,l.currency,
   COALESCE((l.normalization->>'excluded')::boolean,false) excluded,COALESCE((l.normalization->>'projectMappingUnavailable')::boolean,false) "projectMappingUnavailable",l."dateInferred",l."importRunId",l."sourceRecordKey",l.normalization->>'movement' movement,l.normalization->>'version' "normalizationVersion",l.normalization->>'filterFingerprint' "importFilter",j.checkpoint->'policy' "importPolicy",
   l."netAmount"::text "preorderAmount",l.quantity::text "preorderQuantity"
   FROM "OrderLine" l LEFT JOIN "Sku" s ON s.id=l."skuId" AND s."tenantId"=l."tenantId" LEFT JOIN "Brand" b ON b.id=COALESCE(s."brandId",${client.values.profileMode === "MONOBRAND" ? client.values.monoBrandId : null}) AND b."tenantId"=l."tenantId" LEFT JOIN "Category" cat ON cat.id=s."categoryId" AND cat."tenantId"=l."tenantId" LEFT JOIN "ConnectorSyncJob" j ON j."importRunId"=l."importRunId" AND j."tenantId"=l."tenantId" AND j."sourceId"=l."sourceId"
   WHERE l."tenantId"=${tenantId} AND l."sourceId"=${source.id} AND l."eventKey"='current' AND ((l.kind='RETURN' AND ${withinWindows(Prisma.sql`l."returnedAt"`)}) OR (l.kind<>'RETURN' AND ${withinWindows(Prisma.sql`l."paidAt"`)}) OR (l.kind='RETURN' AND l."returnedAt" IS NULL OR l.kind IN ('SALE','CORRECTION') AND l."paidAt" IS NULL)) ORDER BY l.id LIMIT 100001`);
        if (rows.length > 100000)
          throw new SalesReportError("SALES_INPUT_LIMIT", 422);
        const facts = rows.map((row) => {
          const policy = resolveMerchandisingPolicy(row, client.values);
          const stale =
            row.normalizationVersion !== "2" ||
            (row.importFilter ??
              clientOrderFilterFingerprint({
                ...client.values,
                saleStatusesVerified: false,
                excludedChannels: [],
                excludedProjects: [],
                projectField: null,
              })) !== filterKey ||
            row.importPolicy == null ||
            policyKey(row.importPolicy) !== currentPolicyKey;
          const kind =
            row.kind === "PREORDER" ||
            (row.statusId === 33 &&
              sourcePolicy.statuses?.["33"] === "PREORDER")
              ? "PREORDER"
              : row.kind === "SALE" && row.movement === "CORRECTION"
                ? "CORRECTION"
                : row.kind;
          return {
            ...row,
            kind,
            ownership: policy.ownership,
            commissionRate: policy.commissionRate,
            channel: row.channelId
              ? (activePolicy.channels?.[row.channelId] ?? row.channelId)
              : null,
            stale,
            ...(kind === "PREORDER"
              ? { revenue: row.preorderAmount, quantity: row.preorderQuantity }
              : {}),
          };
        });
        const history = salesHistoryCoverage(
          windows,
          cursor?.through ?? null,
          period,
          source.timezone,
          pending.n > 0,
        );
        if (
          facts.some(
            (f) =>
              !f.excluded &&
              (f.stale ||
                f.projectMappingUnavailable ||
                (["SALE", "RETURN", "CORRECTION"].includes(f.kind) && !f.date)),
          )
        ) {
          history.current = false;
          history.ly = false;
        }
        if (anchor.quarantined > 0) {
          history.current = false;
          history.ly = false;
        }
        const oneOffHistory =
          salesHistoryCoverage(
            windows,
            cursor?.through ?? null,
            { ...period, lyFrom: lyMonthFrom, lyTo: lyMonthTo },
            source.timezone,
            pending.n > 0,
          ).ly && history.ly;
        const factHash = payloadHash(rows),
          inputKey = payloadHash({
            version: SALES_CALCULATION_VERSION,
            period,
            configs,
            client: client.values,
            factHash,
            history,
            sourceBusy: pending.n > 0,
            quarantined: anchor.quarantined,
            oneOffHistory,
          });
        const [cached] = await tx.$queryRaw<
          Array<{ financialResult: PublishedSalesReport }>
        >(
          Prisma.sql`SELECT "financialResult" FROM "ReportCalculationRun" WHERE "tenantId"=${tenantId} AND "inputKey"=${inputKey} AND "reportKind"='SALESDRIVE' AND "importRunId"=${anchor.id} AND "calculationVersion"=${SALES_CALCULATION_VERSION} AND status IN ('SUCCESS','WARNING')`,
        );
        if (cached) return cached.financialResult;
        const report = calculateSalesReport(facts, {
          period,
          history,
          settings: client.values,
          oneOffHistory,
        });
        if (anchor.quarantined > 0)
          report.issues.push({
            code: "IMPORT_QUARANTINED",
            count: anchor.quarantined,
            examples: [],
          });
        const result: PublishedSalesReport = {
          ...report,
          calculationRunId: randomUUID(),
          inputKey,
          calculatedAt: new Date().toISOString(),
          provenance: {
            sourceId: source.id,
            clientConfigId: client.id,
            configIds: configs.map((c) => c.id),
            importRunIds: [...new Set(rows.map((r) => r.importRunId))].sort(),
            factCount: rows.length,
            factHash,
            historyBasis:
              "COMPLETED_ORDER_CREATION_WINDOW_PLUS_INCREMENTAL_WATERMARK",
            sourceBusy: pending.n > 0,
          },
        };
        const status =
          report.issues.length || !history.current || !history.ly
            ? "WARNING"
            : "SUCCESS";
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "ReportCalculationRun" (id,"tenantId","importRunId","dateFrom","dateTo","asOfDate","calculationVersion","reportKind","inputKey","financialResult",status,warnings,"completedAt","updatedAt") VALUES (${result.calculationRunId},${tenantId},${anchor.id},${period.from}::date,${period.to}::date,${period.asOf}::date,${SALES_CALCULATION_VERSION},'SALESDRIVE',${inputKey},${JSON.stringify(result)}::jsonb,${status}::"DataRunStatus",${JSON.stringify(report.issues)}::jsonb,now(),now()) ON CONFLICT ("tenantId","importRunId","dateFrom","dateTo","asOfDate","calculationVersion","inputKey") DO NOTHING`,
        );
        const [published] = await tx.$queryRaw<
          Array<{ financialResult: PublishedSalesReport }>
        >(
          Prisma.sql`SELECT "financialResult" FROM "ReportCalculationRun" WHERE "tenantId"=${tenantId} AND "inputKey"=${inputKey} AND "importRunId"=${anchor.id} AND "reportKind"='SALESDRIVE'`,
        );
        return published.financialResult;
      },
      { timeout: 45000, maxWait: 5000 },
    );
  for (let attempt = 0; ; attempt++) {
    try {
      return await calculate();
    } catch (error) {
      const conflict = error as { code?: string; meta?: { code?: string } };
      if (
        attempt === 0 &&
        (conflict?.code === "40001" ||
          conflict?.code === "P2034" ||
          (conflict?.code === "P2010" && conflict.meta?.code === "40001"))
      )
        continue;
      throw error;
    }
  }
}

/** Historical result lookup never falls back across tenants or recomputes another user's selection. */
export async function readPublishedSalesReport(
  tenantId: string,
  id: string,
  db: SqlDatabase = prisma,
) {
  const [row] = await db.$queryRaw<
    Array<{ financialResult: PublishedSalesReport }>
  >(
    Prisma.sql`SELECT "financialResult" FROM "ReportCalculationRun" WHERE id=${id} AND "tenantId"=${tenantId} AND "reportKind"='SALESDRIVE' AND status IN ('SUCCESS','WARNING')`,
  );
  if (!row) throw new SalesReportError("SALES_REPORT_NOT_FOUND", 404);
  return row.financialResult;
}
