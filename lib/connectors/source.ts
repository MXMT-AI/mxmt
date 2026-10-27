import "server-only";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { SqlClient, SqlDatabase } from "./database";
export const PROVIDER_KINDS = {
  salesdrive: "SALESDRIVE",
  keycrm: "KEYCRM",
  horoshop: "HOROSHOP",
  shopify: "SHOPIFY",
  csv: "CSV",
} as const;
export type SourceProvider = keyof typeof PROVIDER_KINDS;
export const isSourceProvider = (value: string): value is SourceProvider =>
  Object.hasOwn(PROVIDER_KINDS, value);
export class ConnectorSourceError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}
/** Correlated selection; no row retains the exact legacy SalesDrive default. Aliases are code constants. */
export function selectedConnection(alias = "c") {
  const c = Prisma.raw(
    alias === "ConnectorConnection" ? '"ConnectorConnection"' : alias,
  );
  return Prisma.sql`${c}."sourceId"=COALESCE(
    (SELECT x."sourceId" FROM "ConnectorSelection" x WHERE x."tenantId"=${c}."tenantId"),
    (SELECT legacy."sourceId" FROM "ConnectorConnection" legacy WHERE legacy."tenantId"=${c}."tenantId" AND legacy.provider='salesdrive'))`;
}
export const mappingKey = (provider: string, sourceId: string) =>
  `${provider}:${sourceId}`;
export async function readSelectedSource(tenantId: string, tx: SqlClient) {
  const [source] = await tx.$queryRaw<
    Array<{
      id: string;
      timezone: string;
      provider: SourceProvider;
      revision: number;
    }>
  >(Prisma.sql`
    SELECT s.id,s.timezone,c.provider,COALESCE(x.revision,0)::int revision FROM "DataSource" s
    JOIN "ConnectorConnection" c ON c."sourceId"=s.id AND c."tenantId"=s."tenantId"
    LEFT JOIN "ConnectorSelection" x ON x."tenantId"=s."tenantId"
    WHERE s."tenantId"=${tenantId} AND ${selectedConnection()} AND s.kind::text=upper(c.provider)`);
  return source ?? null;
}
export async function listConnectorSources(
  tenantId: string,
  db: SqlClient = prisma,
) {
  const [selection, connections] = await Promise.all([
    readSelectedSource(tenantId, db),
    db.$queryRaw<
      Array<{
        sourceId: string;
        provider: string;
        accountHost: string;
        revision: number;
        lastCheck: unknown;
      }>
    >(Prisma.sql`
      SELECT c."sourceId",c.provider,c."accountHost",c.revision,c."lastCheck" FROM "ConnectorConnection" c
      JOIN "DataSource" s ON s.id=c."sourceId" AND s."tenantId"=c."tenantId"
      WHERE c."tenantId"=${tenantId} AND s.kind::text=upper(c.provider) ORDER BY c.provider`),
  ]);
  const [saved] = await db.$queryRaw<
    Array<{ sourceId: string; revision: number }>
  >(
    Prisma.sql`SELECT "sourceId",revision FROM "ConnectorSelection" WHERE "tenantId"=${tenantId}`,
  );
  return {
    sourceId: saved?.sourceId ?? selection?.id ?? null,
    revision: saved?.revision ?? selection?.revision ?? 0,
    connections,
  };
}
/** Only an explicit administrator action changes financial source selection; saving credentials never calls this. */
export async function selectConnectorSource(
  tenantId: string,
  actorId: string,
  sourceId: string,
  expectedRevision: number,
  db: SqlDatabase = prisma,
) {
  if (
    !sourceId ||
    sourceId.length > 200 ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  )
    throw new ConnectorSourceError("INVALID_SOURCE_SELECTION", 400);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR UPDATE`,
    );
    const current = await readSelectedSource(tenantId, tx);
    const [saved] = await tx.$queryRaw<
      Array<{ sourceId: string; revision: number }>
    >(
      Prisma.sql`SELECT "sourceId",revision FROM "ConnectorSelection" WHERE "tenantId"=${tenantId}`,
    );
    const currentRevision = saved?.revision ?? current?.revision ?? 0;
    if (currentRevision !== expectedRevision)
      throw new ConnectorSourceError("SOURCE_SELECTION_CHANGED");
    const [target] = await tx.$queryRaw<
      Array<{
        sourceId: string;
        provider: string;
        lastCheck: { ok?: boolean } | null;
      }>
    >(Prisma.sql`
      SELECT c."sourceId",c.provider,c."lastCheck" FROM "ConnectorConnection" c JOIN "DataSource" s ON s.id=c."sourceId" AND s."tenantId"=c."tenantId"
      WHERE c."tenantId"=${tenantId} AND c."sourceId"=${sourceId} AND s.kind::text=upper(c.provider) FOR UPDATE OF c`);
    if (!target || !isSourceProvider(target.provider))
      throw new ConnectorSourceError("CONNECTOR_SOURCE_NOT_FOUND", 404);
    if (target.lastCheck?.ok !== true)
      throw new ConnectorSourceError("CONNECTOR_CHECK_REQUIRED");
    if (current?.id === sourceId)
      return { sourceId, revision: current.revision };
    const revision = currentRevision + 1;
    await tx.$executeRaw(Prisma.sql`INSERT INTO "ConnectorSelection" ("tenantId","sourceId",revision) VALUES (${tenantId},${sourceId},${revision})
      ON CONFLICT("tenantId") DO UPDATE SET "sourceId"=EXCLUDED."sourceId",revision=EXCLUDED.revision,"updatedAt"=now()`);
    await tx.$executeRaw(
      Prisma.sql`UPDATE "Tenant" SET "updatedAt"=now() WHERE id=${tenantId}`,
    );
    await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","entityId","idempotencyKey",before,after,context)
      VALUES (${randomUUID()},${tenantId},${actorId},'SOURCE_SELECTED','CONNECTOR_SOURCE',${sourceId},${`source-selection:${revision}`},${JSON.stringify(current)}::jsonb,${JSON.stringify({ sourceId, revision })}::jsonb,'{}')`);
    return { sourceId, revision };
  });
}
/** Historic reads remain available; new financial actions require the currently selected source/revision. */
export async function assertSelectedSource(
  tenantId: string,
  sourceId: string,
  revision: number | undefined,
  tx: SqlClient,
) {
  const selected = await readSelectedSource(tenantId, tx);
  if (
    !selected ||
    selected.id !== sourceId ||
    selected.revision !== (revision ?? 0)
  )
    throw new ConnectorSourceError("CONNECTOR_SOURCE_CHANGED");
}
