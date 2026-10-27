import { assertSelectedSource } from "./connectors/source";
import "server-only";
import { profileReordering } from "./merchandising-profile";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { SqlClient, SqlDatabase } from "./connectors/database";
import { withCalculationSnapshot } from "./calculation-snapshot";
import { readScreenSnapshot } from "./merchandising-snapshot";
import { dataTablePagination } from "./data-table-api";
import {
  calculateReordering,
  parseReorderingRequest,
  ReorderingError,
} from "./reorder-calc";
import {
  REORDERING_INPUT_LIMIT,
  type ReorderingSku,
  type ReorderingRequest,
} from "./reordering-contract";
import type { ClassifiedDailySku, MerchandisingPolicy } from "./classify";
/** Export can reuse the complete validated scenario inside its own authorized audit transaction. */
export async function calculateReorderingInSnapshot(
  tenantId: string,
  request: ReorderingRequest,
  tx: SqlClient,
) {
  const snapshot = await readScreenSnapshot(tenantId, request.snapshotId, tx);
  await assertSelectedSource(tenantId, snapshot.sourceId, snapshot.sourceState.selectionRevision, tx);
  if (snapshot.modelVersion < 2 || snapshot.stock.calculationVersion !== 2)
    throw new ReorderingError("REORDERING_SNAPSHOT_REFRESH_REQUIRED", 409);
  const records = await tx.$queryRaw<
    Array<{
      metrics: ClassifiedDailySku;
      details: {
        barcode: string | null;
        categoryName: string | null;
        supplierName: string | null;
        unitCost: string | null;
        inTransitQuantity: number | null;
        policy: MerchandisingPolicy;
      };
    }>
  >(Prisma.sql`
 SELECT d.metrics,s.details FROM "MerchandisingScreenSku" s JOIN "SkuDaily" d ON d.id=s."dailyId" AND d."tenantId"=s."tenantId" AND d."skuId"=s."skuId" WHERE s."tenantId"=${tenantId} AND s."snapshotId"=${snapshot.snapshotId} ORDER BY s."skuId" LIMIT ${REORDERING_INPUT_LIMIT + 1}`);
  if (records.length > REORDERING_INPUT_LIMIT)
    throw new ReorderingError("REORDERING_INPUT_LIMIT", 422);
  if (records.length !== snapshot.stock.rowCount)
    throw new ReorderingError("INCOMPLETE_REORDERING_INPUTS", 409);
  const rows: ReorderingSku[] = records.map(({ metrics: m, details: d }) => {
    if (!d.policy || !("inTransitQuantity" in d))
      throw new ReorderingError("REORDERING_SNAPSHOT_REFRESH_REQUIRED", 409);
    return {
      skuId: m.skuId,
      sku: m.sku,
      name: m.name,
      barcode: d.barcode,
      brandId: m.brandId,
      brandName: m.brandName,
      categoryId: m.categoryId,
      categoryName: d.categoryName,
      supplierName: d.supplierName,
      currency: m.currency,
      classification: m.classification,
      productKind: m.productKind,
      active: m.active,
      inSeason: m.inSeason,
      ownership: m.ownership,
      quantity: m.quantity,
      unitCost: d.unitCost,
      inTransitQuantity:
        d.inTransitQuantity === null ? null : String(d.inTransitQuantity),
      velocityPerWeek: m.velocityPerWeek,
      velocityState: m.velocityState,
      velocityBasis: m.velocityBasis,
      denominatorWeeks: m.denominatorWeeks,
      daysToZero: m.daysToZero,
      policy: d.policy,
      diagnostics: m.diagnostics,
    };
  });
  const client = snapshot.sales.context.settings;
  request = profileReordering(request, client.profileMode === "MONOBRAND");
  const options = (
    id: "brandId" | "supplierId",
    name: "brandName" | "supplierName",
  ) => {
    const map = new Map<string, string | null>();
    for (const row of rows) {
      if (row.productKind !== "MERCHANDISE") continue;
      map.set(
        (id === "supplierId" ? row.policy.supplierId : row[id]) ??
          "__unassigned__",
        row[name],
      );
    }
    return [...map]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, name]) => ({ id, name }));
  };
  return {
    ...calculateReordering(
      { snapshotId: snapshot.snapshotId, asOf: snapshot.stock.asOf, rows },
      request,
    ),
    context: {
      sourceId: snapshot.sourceId,
      stockCalculationId: snapshot.stock.calculationId,
      stockCalculationVersion: snapshot.stock.calculationVersion,
      cutoff: snapshot.stock.cutoff,
      timezone: snapshot.sourceState.timezone,
      configIds: snapshot.settings.configIds,
      channelScope: "ALL_CHANNELS",
    },
    defaults: {
      mode: "shortage",
      parameters: {},
      clientPolicy: {
        leadDays: client.leadDays,
        coverDays: client.coverDays,
        moq: client.moq,
      },
    },
    filterOptions: {
      brands: options("brandId", "brandName"),
      suppliers: options("supplierId", "supplierName"),
    },
  };
}
/** No live inventory, catalog, settings or order facts can replace frozen preview inputs. */
export async function getReorderingPreview(
  tenantId: string,
  value: unknown,
  db: SqlDatabase = prisma,
) {
  const request = parseReorderingRequest(value);
  return withCalculationSnapshot(db, async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
    const result = await calculateReorderingInSnapshot(tenantId, request, tx);
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
