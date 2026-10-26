import "server-only";
import { Prisma } from "@prisma/client";
import { Temporal } from "@js-temporal/polyfill";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import type { SqlClient, SqlDatabase } from "./connectors/database";
import { withCalculationSnapshot } from "./calculation-snapshot";
import { payloadHash } from "./connectors/order-storage";
import {
  readScreenSnapshot,
  readScreenSourceState,
  screenSourceKey,
  type ScreenSnapshot,
} from "./merchandising-snapshot";
import { getSalesReportInSnapshot, SalesReportError } from "./sales-report";
import { resolveSalesPeriod } from "./sales-period";
import { createOrderHistoryCoverage } from "./order-history";
import { isEligibleSalesFact, type SalesFact } from "./sales-metrics";
import { financialDecimal as D } from "./merchandising-policy";
import { dataTablePagination } from "./data-table-api";
import {
  REPRICING_VERSION,
  REPRICING_INPUT_LIMIT,
  REPRICING_DEFAULTS,
  REPRICING_PRESETS,
  RepricingError,
  calculateRepricing,
  parseRepricingRequest,
  type RepricingSku,
  type RepricingRequest,
} from "./repricing";

type Sold = RepricingSku["sold"];
interface InputManifest {
  id: string;
  snapshotId: string;
  version: number;
  inputKey: string;
  createdAt: string;
  sourceStateKey: string;
  context: {
    asOf: string;
    cutoff: string;
    timezone: string;
    channelScope: "ALL_CHANNELS";
    salesCalculationId: string | null;
    stockCalculationId: string;
    stockCalculationVersion: number;
    configIds: string[];
  };
  windows: Record<1 | 3 | 7, { from: string; to: string; complete: boolean }>;
  historyUnavailableReason: "INPUT_LIMIT" | "INCOMPLETE_HISTORY" | null;
  soldBySku: Array<{ skuId: string; sold: Sold }>;
}
const inputKey = (snapshotId: string) =>
  `calculation:repricing-inputs:${payloadHash({ snapshotId, version: REPRICING_VERSION })}`;
/** Read frozen names, quantities, prices and effective ownership without joining the live catalog. */
async function frozenSkus(
  tenantId: string,
  snapshot: ScreenSnapshot,
  tx: SqlClient,
) {
  if (snapshot.stock.calculationVersion < 2)
    throw new RepricingError("REPRICING_SNAPSHOT_REFRESH_REQUIRED", 409);
  const rows = await tx.$queryRaw<
    Omit<RepricingSku, "sold">[]
  >(Prisma.sql`SELECT s."skuId",COALESCE(d.metrics->>'sku',s."skuId") sku,COALESCE(d.metrics->>'name',d.metrics->>'sku',s."skuId") name,s.details->>'barcode' barcode,d.metrics->>'brandId' "brandId",d.metrics->>'brandName' "brandName",d.metrics->>'categoryId' "categoryId",s.details->>'categoryName' "categoryName",d.classification,d.metrics->>'productKind' "productKind",d.metrics->>'ownership' ownership,d.currency,d.quantity::text quantity,s.details->>'unitCost' "unitCost",s.details->>'retailPrice' "currentPrice",d.metrics->>'lastSaleDate' "lastSaleDate",d.metrics->>'firstReceiptDate' "firstReceiptDate",(d.metrics->>'lastSaleDate' IS NULL AND COALESCE((d.metrics->>'cohortHistoryComplete')::boolean,false) AND (d.metrics->>'cohortSalesUnits')::numeric=0) "neverSold"
 FROM "MerchandisingScreenSku" s JOIN "SkuDaily" d ON d.id=s."dailyId" AND d."tenantId"=s."tenantId" AND d."skuId"=s."skuId" WHERE s."tenantId"=${tenantId} AND s."snapshotId"=${snapshot.snapshotId} ORDER BY s."skuId" LIMIT ${REPRICING_INPUT_LIMIT + 1}`);
  if (rows.length > REPRICING_INPUT_LIMIT)
    throw new RepricingError("REPRICING_INPUT_LIMIT", 422);
  if (rows.length !== snapshot.stock.rowCount)
    throw new RepricingError("INCOMPLETE_REPRICING_INPUTS", 409);
  return rows;
}
/** Find a published immutable input set, scoped by tenant even when an ID is guessed. */
async function readManifest(
  tenantId: string,
  tx: SqlClient,
  id?: string,
  key?: string,
): Promise<InputManifest | null> {
  const [row] = await tx.$queryRaw<
    Array<{ values: { inputs: InputManifest } }>
  >(
    Prisma.sql`SELECT values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "configType"='GENERAL' AND values->>'kind'='REPRICING_INPUTS_V1' AND ${id ? Prisma.sql`id=${id}` : Prisma.sql`key=${key}`} AND revision=1`,
  );
  if (!row) return null;
  if (row.values.inputs.version !== REPRICING_VERSION)
    throw new RepricingError("REPRICING_VERSION_UNSUPPORTED", 409);
  return row.values.inputs;
}
/** Publish compact 1/3/7-month unit aggregates only while source/settings still match the stock snapshot. */
export async function createRepricingInputs(
  tenantId: string,
  snapshotId: string,
  db: SqlDatabase = prisma,
  now = new Date(),
) {
  return withCalculationSnapshot(db, async (tx) => {
    const snapshot = await readScreenSnapshot(tenantId, snapshotId, tx),
      key = inputKey(snapshotId),
      cached = await readManifest(tenantId, tx, undefined, key);
    if (cached) return inputResponse(cached);
    const live = await readScreenSourceState(tenantId, snapshot.sourceId, tx);
    if (
      !live ||
      screenSourceKey(live) !== snapshot.sourceStateKey ||
      live.pending > 0
    )
      throw new RepricingError("REPRICING_SOURCE_CHANGED", 409, [
        "snapshotId: refresh the screen snapshot after synchronization",
      ]);
    const skus = await frozenSkus(tenantId, snapshot, tx),
      asOf = Temporal.PlainDate.from(snapshot.stock.asOf),
      end = asOf.subtract({ days: 1 }).toString();
    const windows = Object.fromEntries(
      ([1, 3, 7] as const).map((months) => [
        months,
        {
          from: asOf.subtract({ months }).toString(),
          to: end,
          complete: false,
        },
      ]),
    ) as InputManifest["windows"];
    let facts: SalesFact[] = [],
      salesCalculationId: string | null = null,
      historyUnavailableReason: InputManifest["historyUnavailableReason"] =
        null;
    const report = await getSalesReportInSnapshot(
      tenantId,
      resolveSalesPeriod({ dateFrom: windows[7].from, dateTo: end, now }),
      tx,
      (rows) => {
        facts = rows;
      },
    ).catch((error: unknown) => {
      if (
        error instanceof SalesReportError &&
        error.code === "SALES_INPUT_LIMIT"
      ) {
        facts = [];
        historyUnavailableReason = "INPUT_LIMIT";
        return null;
      }
      throw error;
    });
    if (report) {
      if (
        report.provenance.sourceId !== snapshot.sourceId ||
        report.provenance.clientConfigId !== snapshot.settings.clientConfigId ||
        payloadHash(report.provenance.configIds) !==
          payloadHash(snapshot.settings.configIds)
      )
        throw new RepricingError("REPRICING_SOURCE_CHANGED", 409);
      salesCalculationId = report.calculationRunId;
      const spans = await tx.$queryRaw<Array<{ from: string; to: string }>>(
        Prisma.sql`SELECT j.checkpoint->>'from' "from",j.checkpoint->>'to' "to" FROM "ConnectorSyncJob" j JOIN "DataImportRun" r ON r.id=j."importRunId" AND r."tenantId"=j."tenantId" WHERE j."tenantId"=${tenantId} AND j."sourceId"=${snapshot.sourceId} AND j.resource='orders' AND j.mode='BACKFILL' AND j.state='COMPLETE' AND r.status IN ('SUCCESS','WARNING') ORDER BY j."createdAt" LIMIT 1001`,
      );
      const badFacts = facts.some(
        (f) =>
          f.stale ||
          (!f.excluded &&
            (f.projectMappingUnavailable ||
              (["SALE", "RETURN", "CORRECTION"].includes(f.kind) &&
                (!f.date || f.quantity === null || !f.skuId)))),
      );
      const blocked =
        report.provenance.sourceBusy ||
        badFacts ||
        report.issues.some((i) => i.code === "IMPORT_QUARANTINED");
      const history = createOrderHistoryCoverage(
        spans,
        live.orderThrough,
        live.timezone,
        blocked,
      );
      for (const months of [1, 3, 7] as const)
        windows[months].complete = history.covers(windows[months].from, end);
      if ([1, 3, 7].some((m) => !windows[m as 1 | 3 | 7].complete))
        historyUnavailableReason = "INCOMPLETE_HISTORY";
    }
    const sold = new Map(
      skus.map((r) => [r.skuId, { 1: D(0), 3: D(0), 7: D(0) }]),
    );
    for (const fact of facts) {
      if (
        !fact.skuId ||
        !isEligibleSalesFact(fact) ||
        fact.productKind !== "MERCHANDISE" ||
        fact.quantity === null ||
        !fact.date
      )
        continue;
      const totals = sold.get(fact.skuId);
      if (!totals) continue;
      for (const months of [1, 3, 7] as const)
        if (fact.date >= windows[months].from && fact.date <= end)
          totals[months] = totals[months].add(fact.quantity);
    }
    const inputs: InputManifest = {
      id: randomUUID(),
      snapshotId,
      version: REPRICING_VERSION,
      inputKey: key,
      createdAt: now.toISOString(),
      sourceStateKey: snapshot.sourceStateKey,
      context: {
        asOf: snapshot.stock.asOf,
        cutoff: snapshot.stock.cutoff,
        timezone: live.timezone,
        channelScope: "ALL_CHANNELS",
        salesCalculationId,
        stockCalculationId: snapshot.stock.calculationId,
        stockCalculationVersion: snapshot.stock.calculationVersion,
        configIds: snapshot.settings.configIds,
      },
      windows,
      historyUnavailableReason,
      soldBySku: skus.map((r) => ({
        skuId: r.skuId,
        sold: Object.fromEntries(
          ([1, 3, 7] as const).map((m) => [
            m,
            windows[m].complete ? sold.get(r.skuId)![m].toFixed() : null,
          ]),
        ) as Sold,
      })),
    };
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive") VALUES (${inputs.id},${tenantId},'GENERAL',${key},1,${JSON.stringify({ kind: "REPRICING_INPUTS_V1", inputs })}::jsonb,false) ON CONFLICT ("tenantId","configType",key,revision) DO NOTHING`,
    );
    const published = await readManifest(tenantId, tx, undefined, key);
    if (!published)
      throw new RepricingError("REPRICING_PUBLICATION_FAILED", 503);
    return inputResponse(published);
  });
}
/** Publish option metadata without sending 20,000 frozen SKU rows to the browser. */
function inputResponse(inputs: InputManifest) {
  return {
    inputSetId: inputs.id,
    snapshotId: inputs.snapshotId,
    calculationVersion: inputs.version,
    createdAt: inputs.createdAt,
    context: inputs.context,
    windows: inputs.windows,
    historyUnavailableReason: inputs.historyUnavailableReason,
    defaults: {
      parameters: REPRICING_DEFAULTS,
      filters: { status: "DEAD", soldMonths: 3, currency: "UAH" },
    },
    presets: REPRICING_PRESETS,
    capabilities: { preview: true, export: true, execute: false },
  };
}
/** Export consumers can reuse this full validated result inside their own atomic audit transaction. */
export async function calculateRepricingInSnapshot(
  tenantId: string,
  request: RepricingRequest,
  tx: SqlClient,
) {
  const inputs = await readManifest(tenantId, tx, request.inputSetId);
  if (!inputs) throw new RepricingError("REPRICING_INPUTS_NOT_FOUND", 404);
  const snapshot = await readScreenSnapshot(tenantId, inputs.snapshotId, tx),
    rows = await frozenSkus(tenantId, snapshot, tx),
    sold = new Map(inputs.soldBySku.map((r) => [r.skuId, r.sold]));
  if (rows.length !== sold.size || rows.some((r) => !sold.has(r.skuId)))
    throw new RepricingError("INCOMPLETE_REPRICING_INPUTS", 409);
  return {
    ...calculateRepricing(
      {
        id: inputs.id,
        snapshotId: inputs.snapshotId,
        asOf: inputs.context.asOf,
        rows: rows.map((r) => ({ ...r, sold: sold.get(r.skuId)! })),
      },
      request,
    ),
    context: inputs.context,
    windows: inputs.windows,
    historyUnavailableReason: inputs.historyUnavailableReason,
  };
}
/** Recalculate the full selection before paging its display rows; the browser never supplies input facts. */
export async function getRepricingPreview(
  tenantId: string,
  value: unknown,
  db: SqlDatabase = prisma,
) {
  const request = parseRepricingRequest(value);
  return withCalculationSnapshot(db, async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
    const result = await calculateRepricingInSnapshot(tenantId, request, tx);
    return {
      ...result,
      rows: result.rows.slice(
        (request.page - 1) * request.pageSize,
        request.page * request.pageSize,
      ),
      pagination: dataTablePagination(
        request.page,
        request.pageSize,
        result.rows.length,
      ),
      capabilities: { preview: true, export: true, execute: false },
    };
  });
}
