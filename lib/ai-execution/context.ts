import "server-only";
import { Prisma } from "@prisma/client";
import { payloadHash } from "../connectors/order-storage";
import type { SqlClient } from "../connectors/database";
import { readSelectedSource } from "../connectors/source";
import { readScreenSnapshot, readScreenSourceState, screenSourceKey } from "../merchandising-snapshot";
import { parseScreenQuery, type ScreenQuery } from "../merchandising-screen-query";
import { profileFilters } from "../merchandising-profile";
import { readScreenSales } from "../merchandising-screen-sales";
import { readScreenStock, screenStockFilter, screenStockJoin } from "../merchandising-screen-stock";
import { readPublishedSalesReport } from "../sales-report";
import { readSkuDaily } from "../sku-daily-store";
import { readScenarioAdviceEvidence } from "../scenario-export-store";
import { ScenarioExportError } from "../scenario-csv";
import { AiExecutionError, type AiPrincipal } from "./contracts";

/** Verify current same-tenant membership and the role required by the requested operation. */
export async function assertAiPrincipal(p: AiPrincipal, tx: SqlClient, admin = false) {
  const [user] = await tx.$queryRaw<Array<{role: string}>>(Prisma.sql`SELECT role FROM "User" WHERE id=${p.userId} AND "tenantId"=${p.tenantId}`);
  if (!user || !(admin ? ["ADMIN", "SUPER_ADMIN"] : ["ADMIN", "SUPER_ADMIN", "ANALYST"]).includes(user.role))
    throw new AiExecutionError("AI_FORBIDDEN", 403);
}
const FILTERS = ["brandId", "categoryId", "skuId", "channelId", "currency", "classification", "ownership", "supplierId", "search"] as const;
export type AiFilters = Partial<Record<typeof FILTERS[number], string>>;
export interface AiScenarioSelection {exportId: string; kind: "reprice" | "reorder"}
/** Reuse canonical screen validation while keeping caller filter errors in the AI 400 contract. */
export function evidenceQuery(snapshotId: string, filters: AiFilters): ScreenQuery {
  const params = new URLSearchParams({snapshotId, pageSize: "1", domain: "stock"});
  for (const [key, value] of Object.entries(filters)) {
    if (!FILTERS.includes(key as typeof FILTERS[number]) || typeof value !== "string") throw new AiExecutionError("AI_INVALID_FILTER", 400);
    params.set(key, value);
  }
  try {
    return parseScreenQuery(params, "overview");
  } catch (error) {
    if ((error as {code?: string})?.code === "INVALID_SCREEN_QUERY")
      throw new AiExecutionError("AI_INVALID_FILTER", 400);
    throw error;
  }
}
/** Read saved tenant-scoped facts and reject stale selection, settings or calculation provenance. */
export async function resolveAiEvidence(p: AiPrincipal, snapshotId: string, filters: AiFilters, tx: SqlClient, scenario?: AiScenarioSelection) {
  await assertAiPrincipal(p, tx);
  const selected = await readSelectedSource(p.tenantId, tx);
  if (!selected) throw new AiExecutionError("AI_CONTEXT_UNSUPPORTED");
  const snapshot = await readScreenSnapshot(p.tenantId, snapshotId, tx);
  const live = await readScreenSourceState(p.tenantId, snapshot.sourceId, tx);
  if (selected.id !== snapshot.sourceId || selected.revision !== (snapshot.sourceState.selectionRevision ?? 0) ||
      !live || live.pending > 0 || screenSourceKey(live) !== snapshot.sourceStateKey)
    throw new AiExecutionError("AI_CONTEXT_STALE");
  const published = await readPublishedSalesReport(p.tenantId, snapshot.sales.calculationId, tx);
  const daily = await readSkuDaily(p.tenantId, snapshot.stock.calculationId, {q: "", page: 1, pageSize: 1, sort: "sku", direction: "asc"}, tx);
  const sameIds = (ids: string[]) => payloadHash(ids.slice().sort()) === payloadHash(snapshot.settings.configIds.slice().sort());
  if (published.calculationRunId !== snapshot.sales.calculationId || published.inputKey !== snapshot.sales.inputKey ||
      published.calculationVersion !== snapshot.sales.calculationVersion || published.provenance.sourceId !== selected.id ||
      published.provenance.clientConfigId !== snapshot.settings.clientConfigId || !sameIds(published.provenance.configIds) ||
      payloadHash(published.period) !== payloadHash(snapshot.sales.context.period) ||
      daily.calculationId !== snapshot.stock.calculationId || daily.inputKey !== snapshot.stock.inputKey ||
      daily.calculationVersion !== snapshot.stock.calculationVersion || daily.provenance.sourceId !== selected.id ||
      daily.provenance.clientConfigId !== snapshot.settings.clientConfigId || !sameIds(daily.provenance.configIds) ||
      daily.rowCount !== daily.pagination.totalRows || daily.asOf !== snapshot.stock.asOf || daily.period.cutoff !== snapshot.stock.cutoff)
    throw new AiExecutionError("AI_CONTEXT_INCOMPLETE");
  let query = evidenceQuery(snapshotId, filters);
  query = profileFilters(query, snapshot.sales.context.settings.profileMode === "MONOBRAND");
  const canonical = Object.fromEntries(FILTERS.map(k => [k, query[k] ?? null]));
  const [observations] = await tx.$queryRaw<Array<{first: string | null; last: string | null; missing: number}>>(Prisma.sql`
    SELECT min((d.metrics->>'sourceObservedAt')::timestamptz)::text first,
      max((d.metrics->>'sourceObservedAt')::timestamptz)::text last,
      count(*) FILTER(WHERE d.metrics->>'sourceObservedAt' IS NULL)::int missing
    FROM ${screenStockJoin} WHERE ${screenStockFilter(p.tenantId,query,"overview")}`);
  const envelope = {
    version: 1, tenantId: p.tenantId, snapshotId: snapshot.snapshotId,
    modelVersion: snapshot.modelVersion, sourceId: selected.id, provider: selected.provider,
    selectionRevision: selected.revision, sourceStateKey: snapshot.sourceStateKey,
    sales: {id: snapshot.sales.calculationId, version: snapshot.sales.calculationVersion, inputKey: snapshot.sales.inputKey},
    daily: {id: snapshot.stock.calculationId, version: snapshot.stock.calculationVersion, inputKey: snapshot.stock.inputKey},
    settings: snapshot.settings, period: snapshot.sales.context.period, timezone: selected.timezone,
    stockObservation: {asOf: snapshot.stock.asOf, cutoff: snapshot.stock.cutoff, observations},
    filters: canonical, coverage: {sales: snapshot.sales.issues, stock: snapshot.stock.issues},
  };
  const sales = await readScreenSales(p.tenantId, snapshot, query, "overview", tx, false);
  const stock = await readScreenStock(p.tenantId, snapshot, query, "overview", tx, false);
  // Server facts remain separate from model text; channel filtering intentionally never narrows shared stock.
  let savedScenario: Awaited<ReturnType<typeof readScenarioAdviceEvidence>> | undefined;
  if (scenario) {
    if (!["reprice","reorder"].includes(scenario.kind) || typeof scenario.exportId !== "string") throw new AiExecutionError("AI_INVALID_SCENARIO",400);
    try { savedScenario = await readScenarioAdviceEvidence(p.tenantId,p.userId,scenario.exportId,snapshotId,tx); }
    catch (error) {
      if (!(error instanceof ScenarioExportError)) throw error;
      throw new AiExecutionError(error.code.startsWith("AI_SCENARIO_") ? error.code : "AI_INVALID_SCENARIO",error.status ?? 400);
    }
    if (savedScenario.receipt.kind !== scenario.kind) throw new AiExecutionError("AI_INVALID_SCENARIO",400);
  }
  const facts = {sales: sales.summary, stock: stock.summary, ...(savedScenario ? {scenario:savedScenario} : {})};
  return {envelope, facts, fingerprint: payloadHash({envelope, facts})};
}
export type AiEvidence = Awaited<ReturnType<typeof resolveAiEvidence>>;
