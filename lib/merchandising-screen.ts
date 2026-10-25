import "server-only";
import { Temporal } from "@js-temporal/polyfill";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { SqlDatabase } from "./connectors/database";
import { withCalculationSnapshot } from "./calculation-snapshot";
import {
  readScreenSnapshot,
  readScreenSourceState,
  screenSourceKey,
  type ScreenSnapshot,
} from "./merchandising-snapshot";
import { readScreenSales } from "./merchandising-screen-sales";
import { readScreenStock } from "./merchandising-screen-stock";
import { SALES_COLUMNS } from "./sales-report-view";
import {
  STOCK_SCREEN_COLUMNS,
  screenColumns,
  type ScreenName,
  type ScreenQuery,
} from "./merchandising-screen-query";
export function screenSnapshotContext(snapshot: ScreenSnapshot) {
  return {
    snapshotId: snapshot.snapshotId,
    sourceId: snapshot.sourceId,
    timezone: snapshot.sourceState.timezone,
    period: snapshot.sales.context.period,
    asOf: snapshot.stock.asOf,
    stockCutoff: snapshot.stock.cutoff,
    settings: snapshot.settings,
    calculationIds: {
      sales: snapshot.sales.calculationId,
      stock: snapshot.stock.calculationId,
    },
    calculationVersion: {
      screen: snapshot.modelVersion,
      sales: snapshot.sales.calculationVersion,
      stock: snapshot.stock.calculationVersion,
    },
    createdAt: snapshot.createdAt,
  };
}
/** All reads use pinned immutable rows. Current source progress can only change freshness metadata. */
export async function getMerchandisingScreen(
  tenantId: string,
  screen: ScreenName,
  q: ScreenQuery,
  db: SqlDatabase = prisma,
  now = new Date(),
) {
  return withCalculationSnapshot(db, async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
    const snapshot = await readScreenSnapshot(tenantId, q.snapshotId, tx);
    const live = await readScreenSourceState(tenantId, snapshot.sourceId, tx);
    const [sales, stock] = await Promise.all([
      screen === "sales" || screen === "overview"
        ? readScreenSales(
            tenantId,
            snapshot,
            q,
            screen,
            tx,
            q.domain === "sales",
          )
        : Promise.resolve(null),
      screen !== "sales"
        ? readScreenStock(
            tenantId,
            snapshot,
            q,
            screen,
            tx,
            q.domain === "stock",
          )
        : Promise.resolve(null),
    ]);
    const changed = screenSourceKey(live) !== snapshot.sourceStateKey;
    const through = live?.orderThrough ? Date.parse(live.orderThrough) : NaN;
    const orderAge = Number.isFinite(through)
      ? Math.max(0, Math.floor((now.getTime() - through) / 1000))
      : null;
    const today = Temporal.Instant.from(now.toISOString())
      .toZonedDateTimeISO(snapshot.sourceState.timezone)
      .toPlainDate()
      .toString();
    const historical = snapshot.stock.asOf < today;
    const sourceStale = orderAge === null || orderAge > 7200;
    const freshness = {
      status: !live
        ? "SOURCE_UNAVAILABLE"
        : live.pending > 0
          ? "SYNCING"
          : changed
            ? "SOURCE_CHANGED"
            : historical
              ? "HISTORICAL"
              : sourceStale
                ? "STALE"
                : "FRESH",
      sourceChanged: changed,
      sourceBusy: (live?.pending ?? 0) > 0,
      orderWatermark: live?.orderThrough ?? null,
      orderAgeSeconds: orderAge,
      sourceStale,
      historical,
      refreshRecommended: changed || sourceStale || Boolean(live?.pending),
      checkedAt: now.toISOString(),
    };
    const selected = q.domain === "sales" ? sales?.table : stock?.table;
    const table = selected
      ? {
          ...selected,
          columns: screenColumns(
            q.domain === "sales" ? SALES_COLUMNS : STOCK_SCREEN_COLUMNS,
          ),
        }
      : null;
    const common = {
      brandId: q.brandId ?? null,
      categoryId: q.categoryId ?? null,
      skuId: q.skuId ?? null,
      currency: q.currency ?? null,
      search: q.search,
    };
    return {
      screen,
      context: screenSnapshotContext(snapshot),
      freshness,
      dataState: table?.pagination.totalRows === 0 ? "EMPTY" : "AVAILABLE",
      sales: sales
        ? {
            ...sales,
            table: undefined,
            channelScope: q.channelId ?? "ALL_CHANNELS",
            filters: { ...common, channelId: q.channelId ?? null },
            issues: snapshot.sales.issues,
            issueScope: "SOURCE_SNAPSHOT",
          }
        : null,
      stock: stock
        ? {
            ...stock,
            table: undefined,
            channelScope: "ALL_CHANNELS",
            channelLabel: { en: "All channels", uk: "Усі канали" },
            filters: {
              ...common,
              classification:
                q.classification ?? (screen === "repricing" ? "DEAD" : null),
              ownership: q.ownership ?? null,
              supplierId: q.supplierId ?? null,
              ...(screen === "reordering" ? { mode: q.mode } : {}),
            },
            issues: [
              ...snapshot.stock.issues,
              ...(stock.summary.statusCounts.DATA_ERROR
                ? [
                    {
                      code: "SKU_DATA_ERROR",
                      count: stock.summary.statusCounts.DATA_ERROR,
                    },
                  ]
                : []),
            ],
          }
        : null,
      table,
      capabilities: {
        readOnly: true,
        preview: false,
        export: false,
        ...(screen === "repricing"
          ? { reason: "REPRICING_SCENARIOS_ARE_SEPARATE_ROADMAP_WORK" }
          : screen === "reordering"
            ? { reason: "REORDER_SCENARIOS_ARE_SEPARATE_ROADMAP_WORK" }
            : {}),
      },
    };
  });
}
