import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { isRecord } from "../api-contracts";
import { assertAiPrincipal } from "../ai-execution/context";
import { aiTransaction } from "../ai-execution/budget";
import type { AiPrincipal } from "../ai-execution/contracts";
import { readClientSettings } from "../merchandising-settings-store";
import { applyClientOrderSettings } from "../merchandising-order-policy";
import { completeConnectorInputs } from "../data-pipeline";
import type { SqlClient, SqlDatabase } from "./database";
import { readSelectedSource, assertSelectedSource } from "./source";
import { payloadHash } from "./order-storage";
import {
  prepareOrderSnapshot,
  replaceOrderSnapshot,
} from "./order-snapshot-storage";
import { recordOrderQuality } from "./product-quality";
import { storeCatalog } from "./catalog-storage";
import { parseOrderPolicy } from "./order-policy";
import { recordIssues } from "./jobs";
import { readSheetsMappingInput } from "./sheets-mapping-store";
import {
  SheetsMappingError as E,
  mappingId,
  parseSheetsMapping,
  sheetsSchemaHash,
  validateMappingColumns,
  createMappingAnalyzer,
} from "./sheets-mapping-validation";
import {
  compileSheetsProjection,
  sheetsOrderPolicy,
  type SheetsProjectionRow,
} from "./sheets-projection-compile";

async function context(p: AiPrincipal, sourceId: string, tx: SqlClient) {
  const input = await readSheetsMappingInput(p, sourceId, tx),
    source = await readSelectedSource(p.tenantId, tx);
  if (!source || source.id !== sourceId || source.provider !== "sheets")
    throw new E("SHEETS_SOURCE_SELECTION_REQUIRED", 409);
  const [config] = await tx.$queryRaw<
    Array<{
      id: string;
      revision: number;
      values: Record<string, unknown>;
      approvalReference: string;
    }>
  >(
    Prisma.sql`SELECT id,revision,values,"approvalReference" FROM "MerchandisingConfig" WHERE "tenantId"=${p.tenantId} AND "configType"='SOURCE_MAPPING' AND key=${`sheets:${sourceId}`} AND "isActive" AND "approvedAt" IS NOT NULL AND "approvedById" IS NOT NULL AND length(btrim("approvalReference"))>0 ORDER BY revision DESC LIMIT 1`,
  );
  const envelope = config?.values.sheets;
  if (
    !config ||
    !isRecord(envelope) ||
    envelope.version !== 1 ||
    envelope.fileId !== input.fileId ||
    envelope.schemaHash !== sheetsSchemaHash(input)
  )
    throw new E("SHEETS_MAPPING_REQUIRED", 409);
  const mapping = parseSheetsMapping(envelope.mapping);
  validateMappingColumns(mapping, input);
  const basePolicy = sheetsOrderPolicy(mapping),
    client = await readClientSettings(p.tenantId, tx),
    policy = client.id
      ? applyClientOrderSettings(basePolicy, client.values, {
          id: client.id,
          revision: client.revision,
        })
      : basePolicy;
  if (payloadHash(parseOrderPolicy(config.values)) !== payloadHash(basePolicy))
    throw new E("SHEETS_MAPPING_REQUIRED", 409);
  const binding = {
    input,
    mappingId: config.id,
    mapping,
    selectionRevision: source.revision,
    policy,
  };
  return { ...binding, config, basePolicy, hash: payloadHash(binding) };
}
async function readRows(
  p: AiPrincipal,
  input: Awaited<ReturnType<typeof context>>["input"],
  mapping: Awaited<ReturnType<typeof context>>["mapping"],
  db: SqlClient,
) {
  const result: {
    products: SheetsProjectionRow[];
    orders: SheetsProjectionRow[];
  } = { products: [], orders: [] };
  let bytes = 0;
  for (const [resource, key] of [
    ["products", "product_yml"],
    ["orders", "zavod_api"],
  ] as const) {
    const snapshot = input.sheets.find((s) => s.sheetKey === key)!,
      columns = [
        ...new Set(
          Object.values(mapping[resource]).filter(
            (v): v is string => v !== null,
          ),
        ),
      ];
    let after = 0;
    for (;;) {
      const rows = await db.$queryRaw<SheetsProjectionRow[]>(
        Prisma.sql`SELECT "rowNumber",jsonb_build_object(${Prisma.join(columns.flatMap((c) => [Prisma.sql`${c}::text`, Prisma.sql`data->${c}`]))}) data FROM "DataSheetRow" WHERE "tenantId"=${p.tenantId} AND "snapshotId"=${snapshot.id} AND "rowNumber">${after} ORDER BY "rowNumber" LIMIT 1000`,
      );
      if (!rows.length) break;
      bytes += Buffer.byteLength(JSON.stringify(rows));
      if (
        bytes > 32 * 1024 * 1024 ||
        result[resource].length + rows.length > snapshot.rowCount
      )
        throw new E("SHEETS_PROJECTION_INPUT_LIMIT", 422);
      result[resource].push(...rows);
      after = rows[rows.length - 1].rowNumber;
    }
    if (result[resource].length !== snapshot.rowCount)
      throw new E("SHEETS_RAW_SNAPSHOT_CHANGED", 409);
  }
  return result;
}
export async function projectSheetsImport(
  p: AiPrincipal,
  sourceId: string,
  value: unknown,
  db: SqlDatabase = prisma,
) {
  mappingId(sourceId);
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join() !==
      ["importRunId", "mappingId", "selectionRevision"].sort().join() ||
    !Number.isSafeInteger(value.selectionRevision)
  )
    throw new E("INVALID_SHEETS_PROJECTION_REQUEST");
  const expectedRun = mappingId(value.importRunId),
    expectedMapping = mappingId(value.mappingId);
  const initial = await aiTransaction(
    p,
    db,
    (tx) => context(p, sourceId, tx),
    true,
  );
  if (
    initial.input.importRunId !== expectedRun ||
    initial.mappingId !== expectedMapping ||
    initial.selectionRevision !== value.selectionRevision
  )
    throw new E("SHEETS_PROJECTION_CHANGED", 409);
  const rows = await readRows(p, initial.input, initial.mapping, db);
  const analyzer = createMappingAnalyzer(
    initial.mapping,
    initial.input.timezone,
  );
  analyzer.products(rows.products);
  analyzer.orders(rows.orders);
  const summary = analyzer.finish();
  if (summary.blockingErrors.length)
    throw new E("SHEETS_MAPPING_HAS_BLOCKING_ERRORS", 422);
  const compiled = compileSheetsProjection(
      initial.input,
      initial.mapping,
      rows,
      initial.policy,
    ),
    prepared = prepareOrderSnapshot(
      compiled.orders,
      initial.input.timezone,
      initial.policy,
    );
  if (Buffer.byteLength(JSON.stringify(prepared.documents)) > 64 * 1024 * 1024)
    throw new E("SHEETS_PROJECTION_INPUT_LIMIT", 422);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Tenant" WHERE id=${p.tenantId} FOR UPDATE`,
      );
      await assertAiPrincipal(p, tx, true);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "DataSource" WHERE "tenantId"=${p.tenantId} AND id=${sourceId} FOR UPDATE`,
      );
      const current = await context(p, sourceId, tx);
      if (current.hash !== initial.hash)
        throw new E("SHEETS_PROJECTION_CHANGED", 409);
      await assertSelectedSource(
        p.tenantId,
        sourceId,
        initial.selectionRevision,
        tx,
      );
      const [run] = await tx.$queryRaw<
        Array<{
          stats: {
            merchandisingProjection?: { inputHash?: string; stats?: unknown };
          };
        }>
      >(
        Prisma.sql`SELECT stats FROM "DataImportRun" WHERE "tenantId"=${p.tenantId} AND id=${expectedRun} FOR UPDATE`,
      );
      if (run.stats.merchandisingProjection?.inputHash === initial.hash)
        return {
          outcome: "duplicate",
          sourceId,
          importRunId: expectedRun,
          stats: run.stats.merchandisingProjection.stats,
        };
      const scope = {
        tenantId: p.tenantId,
        sourceId,
        importRunId: expectedRun,
        timezone: initial.input.timezone,
        provider: "sheets",
      };
      await tx.$executeRaw(
        Prisma.sql`DELETE FROM "InventorySnapshot" WHERE "tenantId"=${p.tenantId} AND "sourceId"=${sourceId} AND "importRunId"=${expectedRun}`,
      );
      await tx.$executeRaw(
        Prisma.sql`DELETE FROM "PriceHistory" WHERE "tenantId"=${p.tenantId} AND "sourceId"=${sourceId} AND "importRunId"=${expectedRun}`,
      );
      const orderLines = await replaceOrderSnapshot(tx, scope, prepared);
      const catalog = await storeCatalog(tx, scope, compiled.catalog, {
        productKinds: compiled.kinds,
        stockObserved: initial.mapping.policy.stockObservation !== "unverified",
        stockProductIds: compiled.stockProductIds,
        inTransitVerified: initial.mapping.products.inTransit !== null,
        ...(initial.mapping.products.costPrice
          ? {
              exportedCost: {
                mappingId: expectedMapping,
                reference: initial.config.approvalReference,
              },
            }
          : {}),
      });
      if (catalog.issues.includes("STALE_CATALOG_OBSERVATION"))
        throw new E("SHEETS_STALE_OBSERVATION", 409);
      await recordOrderQuality(tx, scope);
      const issues = new Set([
        ...summary.warnings,
        ...compiled.issues,
        ...prepared.issues,
        ...catalog.issues,
      ]);
      await recordIssues(tx, scope, issues);
      const stats = {
        ...compiled.stats,
        orderLines,
        snapshots: catalog.snapshots,
        prices: catalog.prices,
        issues: [...issues],
      };
      const checkpoint = {
        policy: initial.policy,
        historyComplete: false,
        stage: "complete",
        provider: "sheets",
        mappingId: expectedMapping,
        inputHash: initial.hash,
      };
      const [job] = await tx.$queryRaw<Array<{ id: string; resource: string }>>(
        Prisma.sql`SELECT id,resource FROM "ConnectorSyncJob" WHERE "tenantId"=${p.tenantId} AND "importRunId"=${expectedRun} FOR UPDATE`,
      );
      if (job && job.resource !== "orders")
        throw new E("SHEETS_PROJECTION_JOB_CONFLICT", 409);
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",resource,mode,state,"connectionRevision",checkpoint,stats,"updatedAt") VALUES (${job?.id ?? randomUUID()},${p.tenantId},${sourceId},${expectedRun},'orders','REFRESH','COMPLETE',${initial.config.revision},${JSON.stringify(checkpoint)}::jsonb,${JSON.stringify(stats)}::jsonb,now()) ON CONFLICT ("importRunId") DO UPDATE SET state='COMPLETE',"connectionRevision"=EXCLUDED."connectionRevision",checkpoint=EXCLUDED.checkpoint,stats=EXCLUDED.stats,"errorCode"=NULL,"updatedAt"=now()`,
      );
      const manifest = {
        version: 1,
        sourceId,
        importRunId: expectedRun,
        mappingId: expectedMapping,
        inputHash: initial.hash,
        sourceChecksum: initial.input.sourceChecksum,
        stats,
      };
      await tx.$executeRaw(
        Prisma.sql`UPDATE "DataImportRun" SET stats=stats||jsonb_build_object('merchandisingProjection',${JSON.stringify(manifest)}::jsonb),"updatedAt"=now() WHERE "tenantId"=${p.tenantId} AND id=${expectedRun}`,
      );
      await completeConnectorInputs(tx, { ...scope, resource: "orders" });
      await tx.$executeRaw(
        Prisma.sql`UPDATE "ConnectorRecalculation" SET state='WAITING_ENGINE',"requestedAt"=now(),"inputProvenance"=("inputProvenance"-'leaseToken'-'leaseUntil'-'availableAt'-'errorCode'-'phase'-'dailyCalculationId'-'salesCalculationId'-'phaseCompletedAt')||jsonb_build_object('projectionHash',${initial.hash}::text) WHERE "tenantId"=${p.tenantId} AND "importRunId"=${expectedRun}`,
      );
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",after,context) VALUES (${randomUUID()},${p.tenantId},${p.userId},${expectedMapping},'SHEETS_PROJECTED','DATA_IMPORT',${expectedRun},${`sheets-projection:${initial.hash}`},${JSON.stringify(stats)}::jsonb,${JSON.stringify({ version: 1, input: initial.input, mappingId: expectedMapping, selectionRevision: initial.selectionRevision, inputHash: initial.hash })}::jsonb) ON CONFLICT DO NOTHING`,
      );
      return {
        outcome: "projected",
        sourceId,
        importRunId: expectedRun,
        stats,
      };
    },
    { timeout: 45000, maxWait: 5000 },
  );
}

export async function readSheetsProjectionIntent(
  p: AiPrincipal,
  sourceId: string,
  db: SqlDatabase = prisma,
) {
  return aiTransaction(
    p,
    db,
    async (tx) => {
      const state = await context(p, sourceId, tx);
      return {
        sourceId,
        importRunId: state.input.importRunId,
        mappingId: state.mappingId,
        selectionRevision: state.selectionRevision,
      };
    },
    true,
  );
}
