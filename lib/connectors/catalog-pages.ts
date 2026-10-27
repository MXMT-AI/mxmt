import { Prisma } from "@prisma/client";
import type { CatalogSnapshot, MerchandisingConnector } from "./contract";
import type { SqlClient } from "./database";
import type { ConnectorJob } from "./jobs";
import {
  continuation,
  pageRequest,
  advancePage,
  type ContinuationState,
} from "./continuation";
import { ConnectorReadError } from "./read-error";
export interface CatalogPageState {
  continuation?: ContinuationState;
  observationId?: string;
  observedAt?: string;
}
export async function readCatalogPage(
  connector: MerchandisingConnector,
  job: ConnectorJob,
  checkpoint: CatalogPageState,
) {
  if (!connector.getCatalogPage) throw new ConnectorReadError("NOT_CONFIGURED");
  const state = continuation(
    checkpoint.continuation,
    {
      sourceId: job.sourceId,
      provider: connector.provider,
      revision: job.connectionRevision,
      resource: "catalog",
      limit: 100,
      observationId: checkpoint.observationId ?? null,
    },
    connector.capabilities.pagination?.catalog ?? "page",
  );
  const page = await connector.getCatalogPage({
    ...pageRequest(state),
    limit: 100,
    ...(checkpoint.observationId
      ? { observationId: checkpoint.observationId }
      : {}),
  });
  if (
    !page.completePopulation ||
    !page.observationId ||
    page.observationId.length > 200 ||
    (checkpoint.observationId &&
      checkpoint.observationId !== page.observationId) ||
    (checkpoint.observedAt &&
      Date.parse(page.observedAt) < Date.parse(checkpoint.observedAt))
  )
    throw new ConnectorReadError("INVALID_RESPONSE");
  const next = advancePage(state, page, 100);
  // Bind subsequent page positions to the observation established by the first response.
  const nextState = next
    ? {
        ...next,
        binding: continuation(
          undefined,
          {
            sourceId: job.sourceId,
            provider: connector.provider,
            revision: job.connectionRevision,
            resource: "catalog",
            limit: 100,
            observationId: page.observationId,
          },
          state.position.kind,
        ).binding,
      }
    : undefined;
  return {
    page,
    sequence: state.sequence,
    next: nextState,
    done: next === null,
  };
}
/** Stage pages under the import's tenant/source; only the last complete validated observation activates stock. */
export async function stageCatalogPage(
  tx: SqlClient,
  job: ConnectorJob,
  result: Awaited<ReturnType<typeof readCatalogPage>>,
): Promise<CatalogSnapshot | null> {
  const payload = {
    records: result.page.records,
    rawResponse: result.page.rawResponse ?? null,
    observedAt: result.page.observedAt,
    observationId: result.page.observationId,
  };
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 8 * 1024 * 1024)
    throw new ConnectorReadError("RESPONSE_TOO_LARGE");
  await tx.$executeRaw(Prisma.sql`INSERT INTO "ConnectorCatalogPage" ("jobId",sequence,"tenantId","sourceId",payload) VALUES (${job.id},${result.sequence},${job.tenantId},${job.sourceId},${JSON.stringify(payload)}::jsonb)
    ON CONFLICT("jobId",sequence) DO UPDATE SET payload=EXCLUDED.payload`);
  const [size] = await tx.$queryRaw<Array<{ bytes: number; count: number }>>(
    Prisma.sql`SELECT COALESCE(sum(octet_length(payload::text)),0)::int bytes,count(*)::int count FROM "ConnectorCatalogPage" WHERE "jobId"=${job.id} AND "tenantId"=${job.tenantId} AND "sourceId"=${job.sourceId}`,
  );
  if (size.bytes > 32 * 1024 * 1024 || size.count > 1000)
    throw new ConnectorReadError("RESPONSE_TOO_LARGE");
  if (!result.done) return null;
  const pages = await tx.$queryRaw<
    Array<{ sequence: number; payload: typeof payload }>
  >(
    Prisma.sql`SELECT sequence,payload FROM "ConnectorCatalogPage" WHERE "jobId"=${job.id} AND "tenantId"=${job.tenantId} AND "sourceId"=${job.sourceId} ORDER BY sequence`,
  );
  if (
    pages.length !== result.sequence + 1 ||
    pages.some(
      (p, i) =>
        p.sequence !== i || p.payload.observationId !== payload.observationId,
    )
  )
    throw new ConnectorReadError("INVALID_RESPONSE");
  return {
    products: pages.flatMap((p) => p.payload.records.map((r) => r.product)),
    stock: pages.flatMap((p) => p.payload.records.map((r) => r.stock)),
    observedAt: new Date(
      Math.max(...pages.map((p) => Date.parse(p.payload.observedAt))),
    ).toISOString(),
    perRowObservations: true,
    completePopulation: true,
    observationId: payload.observationId,
    rawResponse: JSON.stringify(
      pages.map((p) => p.payload.rawResponse ?? p.payload.records),
    ),
  };
}
