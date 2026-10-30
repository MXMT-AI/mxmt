import "server-only";
import {readSheetsSources} from "./sheets-source";
import type {ReportingSourceProvider,ReportingSources} from "../reporting-source-contract";
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
      provider: ReportingSourceProvider;
      revision: number;
    }>
  >(Prisma.sql`
    SELECT s.id,s.timezone,
      CASE WHEN s.kind='GOOGLE_SHEETS' THEN 'sheets' ELSE c.provider END provider,
      COALESCE(x.revision,0)::int revision FROM "DataSource" s
    LEFT JOIN "ConnectorConnection" c ON c."sourceId"=s.id AND c."tenantId"=s."tenantId"
    LEFT JOIN "ConnectorSelection" x ON x."tenantId"=s."tenantId"
    WHERE s."tenantId"=${tenantId} AND (
      (s.kind='GOOGLE_SHEETS' AND x."sourceId"=s.id)
      OR (s.kind<>'GOOGLE_SHEETS' AND ${selectedConnection()} AND s.kind::text=upper(c.provider)))`);
  return source??null;
}
export async function listConnectorSources(
  tenantId: string,
  db: SqlClient = prisma,
):Promise<ReportingSources> {
  const [selection, connections, sheets] = await Promise.all([
    readSelectedSource(tenantId, db),
    db.$queryRaw<
      Array<{
        sourceId: string;
        provider: string;
        accountHost: string;
        revision: number;
        lastCheck: unknown;
        importReady:boolean;
      }>
    >(Prisma.sql`
      SELECT c."sourceId",c.provider,c."accountHost",c.revision,c."lastCheck",
        EXISTS(SELECT 1 FROM "ConnectorSyncJob" j JOIN "DataImportRun" r ON r.id=j."importRunId" AND r."tenantId"=j."tenantId" AND r."sourceId"=j."sourceId"
          WHERE j."tenantId"=c."tenantId" AND j."sourceId"=c."sourceId" AND j.state='COMPLETE'
            AND j.resource IN ('orders','csv') AND r.status IN ('SUCCESS','WARNING')) "importReady"
        FROM "ConnectorConnection" c
      JOIN "DataSource" s ON s.id=c."sourceId" AND s."tenantId"=c."tenantId"
      WHERE c."tenantId"=${tenantId} AND s.kind::text=upper(c.provider) ORDER BY c.provider`),
    readSheetsSources(tenantId,db),
  ]);
  const [saved] = await db.$queryRaw<
    Array<{ sourceId: string; revision: number }>
  >(
    Prisma.sql`SELECT "sourceId",revision FROM "ConnectorSelection" WHERE "tenantId"=${tenantId}`,
  );
  return {
    sourceId: saved?.sourceId ?? selection?.id ?? null,
    revision: saved?.revision ?? selection?.revision ?? 0,
    connections:[
      ...connections.filter(c=>isSourceProvider(c.provider)).map(({importReady,...c})=>{
        const checked=!!c.lastCheck&&typeof c.lastCheck==="object"&&(c.lastCheck as {ok?:boolean}).ok===true;
        return {...c,provider:c.provider as SourceProvider,selectable:checked,
          readiness:!checked?"CONNECTION_CHECK_REQUIRED" as const:importReady?"READY" as const:"IMPORT_REQUIRED" as const};
      }),
      ...sheets,
    ],
  };
}
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
    const [actor]=await tx.$queryRaw<Array<{role:string}>>(Prisma.sql`
      SELECT role FROM "User" WHERE id=${actorId} AND "tenantId"=${tenantId}`);
    if(!actor||!["ADMIN","SUPER_ADMIN"].includes(actor.role))
      throw new ConnectorSourceError("SOURCE_SELECTION_FORBIDDEN",403);
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
    const [sheet]=target?[]:await readSheetsSources(tenantId,tx,sourceId);
    if(!target&&!sheet)
      throw new ConnectorSourceError("CONNECTOR_SOURCE_NOT_FOUND",404);
    if(sheet&&!sheet.selectable)
      throw new ConnectorSourceError("SHEETS_MAPPING_REQUIRED");
    if(target&&(!isSourceProvider(target.provider)||target.lastCheck?.ok!==true))
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


export async function assertReportingSourceReady(tenantId:string,source:{id:string;provider:ReportingSourceProvider},tx:SqlClient){
  if(source.provider!=="sheets")return;
  const [sheet]=await readSheetsSources(tenantId,tx,source.id);
  if(!sheet)throw new ConnectorSourceError("CONNECTOR_SOURCE_NOT_FOUND",404);
  if(sheet.readiness!=="READY")throw new ConnectorSourceError(
    sheet.readiness==="MAPPING_REQUIRED"?"SHEETS_MAPPING_REQUIRED":"SHEETS_IMPORT_REQUIRED");
}
