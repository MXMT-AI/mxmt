import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { type SalesDriveCredentials } from "./config";
import { encryptCredentials } from "./secrets";
import { PROVIDER_ADAPTERS,createProviderConnector } from "./runtime";
import { PROVIDER_KINDS, type SourceProvider } from "./source";
import type { ConnectionCheck, PublicConnection } from "./contract";

const publicSelect = { accountHost: true, hasReceiptsKey: true, hasYmlUrl: true, revision: true, lastCheck: true } as const;
type PublicRow = { accountHost: string; hasReceiptsKey: boolean; hasYmlUrl: boolean; revision: number; lastCheck: Prisma.JsonValue | null };

function publicConnection(row: PublicRow | null): PublicConnection {
  return { configured: Boolean(row), accountHost: row?.accountHost ?? null, hasReceiptsKey: row?.hasReceiptsKey ?? false,
    hasYmlUrl: row?.hasYmlUrl ?? false, revision: row?.revision ?? null, lastCheck: row?.lastCheck as unknown as ConnectionCheck ?? null };
}

/** Scope every configuration lookup by the authenticated tenant, never request fields. */
export async function getProviderConnection(tenantId: string, provider:SourceProvider="salesdrive"): Promise<PublicConnection> {
  return publicConnection(await prisma.connectorConnection.findUnique({ where: { tenantId_provider: { tenantId, provider } }, select: publicSelect }));
}

/** Replace credentials atomically and invalidate checks for the previous revision. */
export async function saveProviderConnection(tenantId: string, value:unknown, provider:SourceProvider="salesdrive"): Promise<PublicConnection> {
  const registration=PROVIDER_ADAPTERS[provider];
  if(!registration) throw new Error("CONNECTOR_PROVIDER_UNAVAILABLE");
  const parsed=registration.parse(value);
  if(!parsed.credentials) throw new Error("INVALID_CONNECTOR_CONFIG");
  const credentials=registration.identity(parsed.credentials);
  const kind=PROVIDER_KINDS[provider];
  const encryptedConfig = encryptCredentials(parsed.credentials, tenantId,provider);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR UPDATE`);
    const previous=await tx.connectorConnection.findUnique({where:{tenantId_provider:{tenantId,provider}},select:{sourceId:true}});
    const source = await tx.dataSource.upsert({
      where: { tenantId_kind_sourceKey: { tenantId, kind, sourceKey: credentials.sourceKey } },
      create: { tenantId, kind, sourceKey: credentials.sourceKey, name: provider, timezone: credentials.timezone }, update: {}, select: { id: true },
    });
    // Pin the old legacy default if credentials are saved for a different account.
    // Saving/checking a connection must not implicitly switch the financial source.
    if(provider==="salesdrive"&&previous?.sourceId&&previous.sourceId!==source.id) {
      await tx.$executeRaw(Prisma.sql`INSERT INTO "ConnectorSelection" ("tenantId","sourceId") VALUES (${tenantId},${previous.sourceId}) ON CONFLICT("tenantId") DO NOTHING`);
      await tx.$executeRaw(Prisma.sql`UPDATE "Tenant" SET "updatedAt"=now() WHERE id=${tenantId}`);
    }
    const values = { sourceId: source.id, accountHost: credentials.accountHost, encryptedConfig,
      hasReceiptsKey: credentials.hasReceiptsKey, hasYmlUrl: credentials.hasYmlUrl };
    return publicConnection(await tx.connectorConnection.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      create: { tenantId, provider, ...values },
      update: { ...values, revision: { increment: 1 }, lastCheck: Prisma.DbNull, checkedAt: null, capabilities:Prisma.DbNull }, select: publicSelect,
    }));
  });
}

/** Store only sanitized check output, and reject stale results after credential rotation. */
export async function checkProviderConnection(tenantId: string,provider:SourceProvider="salesdrive"): Promise<PublicConnection | null> {
  const row = await prisma.connectorConnection.findUnique({
    where: { tenantId_provider: { tenantId, provider } },
    select: { ...publicSelect, encryptedConfig: true, source: { select: { timezone: true } } },
  });
  if (!row) return null;
  const connector=connectorFor(row.encryptedConfig, tenantId, row.source.timezone,false,provider);
  const result = await connector.checkConnection();
  const updated = await prisma.connectorConnection.updateMany({
    where: { tenantId, provider, revision: row.revision },
    data: { lastCheck: result as unknown as Prisma.InputJsonValue, checkedAt: new Date(result.checkedAt),capabilities:connector.capabilities as unknown as Prisma.InputJsonValue },
  });
  if (updated.count !== 1) throw new Error("CONNECTOR_CONFIG_CHANGED");
  return publicConnection({ ...row, lastCheck: result as unknown as Prisma.JsonValue });
}

/** Load secrets only inside the server; source identity and timezone travel with the adapter. */
export async function loadSalesDriveRuntime(tenantId: string, backfill = false) {
  const row = await prisma.connectorConnection.findUnique({
    where: { tenantId_provider: { tenantId, provider:"salesdrive" } },
    include: { source: { select: { timezone: true } } },
  });
  if (!row) throw new Error("NOT_CONFIGURED");
  return { sourceId: row.sourceId, revision: row.revision, timezone: row.source.timezone,
    connector: connectorFor(row.encryptedConfig, tenantId, row.source.timezone, backfill) };
}

function connectorFor(encrypted:string,tenantId:string,timezone:string,backfill=false,provider:SourceProvider="salesdrive") {
  return createProviderConnector(encrypted,tenantId,provider,timezone,prisma,backfill);
}

export const getSalesDriveConnection=(tenantId:string)=>getProviderConnection(tenantId,"salesdrive");
export const saveSalesDriveConnection=(tenantId:string,credentials:SalesDriveCredentials)=>saveProviderConnection(tenantId,credentials,"salesdrive");
export const checkSalesDriveConnection=(tenantId:string)=>checkProviderConnection(tenantId,"salesdrive");
