import "server-only";
import { randomUUID } from "node:crypto";
import { payloadHash } from "./order-storage";
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
export async function saveProviderConnection(tenantId: string, value:unknown, provider:SourceProvider="salesdrive",actorId?:string): Promise<PublicConnection> {
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
      create: { tenantId, kind, sourceKey: credentials.sourceKey, name: provider, timezone: credentials.timezone }, update: {}, select: { id: true, timezone:true },
    });
    // Pin the old legacy default if credentials are saved for a different account.
    // Saving/checking a connection must not implicitly switch the financial source.
    if(provider==="salesdrive"&&previous?.sourceId&&previous.sourceId!==source.id) {
      await tx.$executeRaw(Prisma.sql`INSERT INTO "ConnectorSelection" ("tenantId","sourceId") VALUES (${tenantId},${previous.sourceId}) ON CONFLICT("tenantId") DO NOTHING`);
      await tx.$executeRaw(Prisma.sql`UPDATE "Tenant" SET "updatedAt"=now() WHERE id=${tenantId}`);
    }
    if(registration.sourceMapping) {
      if(source.timezone!==credentials.timezone)throw new Error("CONNECTOR_CONFIG_CHANGED");
      if(!actorId)throw new Error("INVALID_CONNECTOR_CONFIG");
      const mapping=registration.sourceMapping(parsed.credentials),key=`${provider}:${source.id}`;
      const [old]=await tx.$queryRaw<Array<{id:string;revision:number;values:unknown}>>(Prisma.sql`SELECT id,revision,values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "configType"='SOURCE_MAPPING' AND key=${key} AND "isActive" FOR UPDATE`);
      const changed=!old||payloadHash(old.values)!==payloadHash(mapping.values);
      if(old&&changed&&mapping.revision<=old.revision)throw new Error("CONNECTOR_CONFIG_CHANGED");
      if(changed) {
        const configId=randomUUID();
        await tx.$executeRaw(Prisma.sql`UPDATE "MerchandisingConfig" SET "isActive"=false WHERE "tenantId"=${tenantId} AND "configType"='SOURCE_MAPPING' AND key=${key}`);
        await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference") VALUES (${configId},${tenantId},'SOURCE_MAPPING',${key},${mapping.revision},${JSON.stringify(mapping.values)}::jsonb,true,${actorId},now(),${mapping.reference})`);
        await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",context) VALUES (${randomUUID()},${tenantId},${actorId},${configId},'CONNECTOR_MAPPING_SAVED','SOURCE_MAPPING',${source.id},${`connector-mapping:${configId}`},${JSON.stringify({provider,revision:mapping.revision,reference:mapping.reference})}::jsonb)`);
        await tx.$executeRaw(Prisma.sql`UPDATE "Tenant" SET "updatedAt"=now() WHERE id=${tenantId}`);
      }
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
