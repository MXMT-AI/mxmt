import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseSalesDriveCredentials, type SalesDriveCredentials } from "./config";
import { decryptCredentials, encryptCredentials } from "./secrets";
import { SalesDriveConnector } from "./salesdrive";
import type { ConnectionCheck, PublicConnection } from "./contract";

const publicSelect = { accountHost: true, hasReceiptsKey: true, hasYmlUrl: true, revision: true, lastCheck: true } as const;
type PublicRow = { accountHost: string; hasReceiptsKey: boolean; hasYmlUrl: boolean; revision: number; lastCheck: Prisma.JsonValue | null };

function publicConnection(row: PublicRow | null): PublicConnection {
  return { configured: Boolean(row), accountHost: row?.accountHost ?? null, hasReceiptsKey: row?.hasReceiptsKey ?? false,
    hasYmlUrl: row?.hasYmlUrl ?? false, revision: row?.revision ?? null, lastCheck: row?.lastCheck as unknown as ConnectionCheck ?? null };
}

/** Scope every configuration lookup by the authenticated tenant, never request fields. */
export async function getSalesDriveConnection(tenantId: string): Promise<PublicConnection> {
  return publicConnection(await prisma.connectorConnection.findUnique({ where: { tenantId_provider: { tenantId, provider: "salesdrive" } }, select: publicSelect }));
}

/** Replace credentials atomically and invalidate checks for the previous revision. */
export async function saveSalesDriveConnection(tenantId: string, credentials: SalesDriveCredentials): Promise<PublicConnection> {
  const encryptedConfig = encryptCredentials(credentials, tenantId);
  return prisma.$transaction(async (tx) => {
    const source = await tx.dataSource.upsert({
      where: { tenantId_kind_sourceKey: { tenantId, kind: "SALESDRIVE", sourceKey: credentials.accountHost } },
      create: { tenantId, kind: "SALESDRIVE", sourceKey: credentials.accountHost, name: "SalesDrive", timezone: "Europe/Kyiv" }, update: {}, select: { id: true },
    });
    const values = { sourceId: source.id, accountHost: credentials.accountHost, encryptedConfig,
      hasReceiptsKey: Boolean(credentials.receiptsApiKey), hasYmlUrl: Boolean(credentials.ymlUrl) };
    return publicConnection(await tx.connectorConnection.upsert({
      where: { tenantId_provider: { tenantId, provider: "salesdrive" } },
      create: { tenantId, provider: "salesdrive", ...values },
      update: { ...values, revision: { increment: 1 }, lastCheck: Prisma.DbNull, checkedAt: null }, select: publicSelect,
    }));
  });
}

/** Store only sanitized check output, and reject stale results after credential rotation. */
export async function checkSalesDriveConnection(tenantId: string): Promise<PublicConnection | null> {
  const row = await prisma.connectorConnection.findUnique({
    where: { tenantId_provider: { tenantId, provider: "salesdrive" } },
    select: { ...publicSelect, encryptedConfig: true },
  });
  if (!row) return null;
  const parsed = parseSalesDriveCredentials(decryptCredentials(row.encryptedConfig, tenantId));
  if (!parsed.credentials) throw new Error("CONNECTOR_STORAGE_UNAVAILABLE");
  const result = await new SalesDriveConnector(parsed.credentials).checkConnection();
  const updated = await prisma.connectorConnection.updateMany({
    where: { tenantId, provider: "salesdrive", revision: row.revision },
    data: { lastCheck: result as unknown as Prisma.InputJsonValue, checkedAt: new Date(result.checkedAt) },
  });
  if (updated.count !== 1) throw new Error("CONNECTOR_CONFIG_CHANGED");
  return publicConnection({ ...row, lastCheck: result as unknown as Prisma.JsonValue });
}
