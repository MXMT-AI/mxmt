import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { SqlClient, SqlDatabase } from "./connectors/database";

export const DRIVE_CONNECTION_KEY = "settings:google-sheets";
export class DriveConnectionError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
  }
}
export function parseSpreadsheetId(value: unknown): string {
  if (typeof value !== "string") throw new DriveConnectionError("INVALID_SHEETS_URL");
  let id = value.trim();
  if (id.startsWith("https://")) {
    let url: URL;
    try { url = new URL(id); } catch { throw new DriveConnectionError("INVALID_SHEETS_URL"); }
    const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
    if (url.hostname !== "docs.google.com" || url.port || url.username || url.password || !match)
      throw new DriveConnectionError("INVALID_SHEETS_URL");
    id = match[1];
  }
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new DriveConnectionError("INVALID_SHEETS_URL");
  return id;
}
export interface DriveConnection {
  fileId: string;
  revision: number;
  origin: "tenant" | "legacy_approved";
}
export async function readDriveConnection(tenantId: string, db: SqlClient = prisma): Promise<DriveConnection | null> {
  const [row] = await db.$queryRaw<Array<{ revision: number; values: { fileId?: unknown } }>>(
    Prisma.sql`SELECT revision,values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId}
      AND "configType"='GENERAL' AND key=${DRIVE_CONNECTION_KEY} AND "isActive"`,
  );
  // An invalid explicit binding must fail closed, never fall back to another workbook.
  if (row) return { fileId: parseSpreadsheetId(row.values?.fileId), revision: row.revision, origin: "tenant" };
  const legacy = process.env.GOOGLE_DRIVE_FILE_ID;
  if (!legacy) return null;
  const fileId = parseSpreadsheetId(legacy);
  // Compatibility is limited to an already approved mapping for this exact tenant/file.
  // A raw import (including an accidental one in a new cabinet) grants no binding.
  const approved = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT s.id FROM "DataSource" s JOIN "MerchandisingConfig" c
      ON c."tenantId"=s."tenantId" AND c.key='sheets:'||s.id AND c."configType"='SOURCE_MAPPING'
    WHERE s."tenantId"=${tenantId} AND s.kind='GOOGLE_SHEETS' AND s."driveFileId"=${fileId}
      AND c."isActive" AND c."approvedAt" IS NOT NULL AND c."approvedById" IS NOT NULL
      AND length(btrim(c."approvalReference"))>0 AND c.values->'sheets'->>'fileId'=${fileId}
      AND c.values->'sheets'->>'version'='1' LIMIT 1`);
  return approved.length ? { fileId, revision: 0, origin: "legacy_approved" } : null;
}
export async function requireDriveConnection(tenantId: string): Promise<DriveConnection> {
  const connection = await readDriveConnection(tenantId);
  if (!connection) throw new DriveConnectionError("SHEETS_CONNECTION_REQUIRED", 409);
  return connection;
}
export async function saveDriveConnection(
  tenantId: string, actorId: string, value: unknown, expectedRevision: unknown, db: SqlDatabase = prisma,
): Promise<DriveConnection> {
  const fileId = parseSpreadsheetId(value);
  if (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 0)
    throw new DriveConnectionError("INVALID_CONNECTION_REVISION");
  return db.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR UPDATE`);
    const [actor] = await tx.$queryRaw<Array<{ role: string }>>(Prisma.sql`SELECT role FROM "User" WHERE id=${actorId} AND "tenantId"=${tenantId}`);
    if (!actor || !["ADMIN", "SUPER_ADMIN"].includes(actor.role))
      throw new DriveConnectionError("SHEETS_CONNECTION_FORBIDDEN", 403);
    const [current] = await tx.$queryRaw<Array<{ revision: number }>>(Prisma.sql`
      SELECT revision FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "configType"='GENERAL'
        AND key=${DRIVE_CONNECTION_KEY} ORDER BY revision DESC LIMIT 1`);
    if ((current?.revision ?? 0) !== expectedRevision)
      throw new DriveConnectionError("SHEETS_CONNECTION_CHANGED", 409);
    const revision = (current?.revision ?? 0) + 1;
    await tx.$executeRaw(Prisma.sql`UPDATE "MerchandisingConfig" SET "isActive"=false
      WHERE "tenantId"=${tenantId} AND "configType"='GENERAL' AND key=${DRIVE_CONNECTION_KEY} AND "isActive"`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "MerchandisingConfig"
      (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference")
      VALUES (${randomUUID()},${tenantId},'GENERAL',${DRIVE_CONNECTION_KEY},${revision},
        ${JSON.stringify({ version: 1, fileId })}::jsonb,true,${actorId},now(),'Explicit cabinet Google Sheets connection')`);
    return { fileId, revision, origin: "tenant" as const };
  });
}
