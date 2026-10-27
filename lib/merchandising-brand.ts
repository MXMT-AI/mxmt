import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizedBrandKey } from "./data-normalization";
import { SettingsValidationError } from "./merchandising-settings";
import type { SqlDatabase } from "./connectors/database";
/** Create a tenant-owned brand before the first catalog import, without guessing ownership or commercial terms. */
export async function createMerchandisingBrand(
  tenantId: string,
  actorId: string,
  name: unknown,
  db: SqlDatabase = prisma,
) {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 200 ||
    /[\u0000-\u001f]/.test(name)
  )
    throw new SettingsValidationError({ brandName: "invalid_name" });
  const key = normalizedBrandKey(name)!;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR NO KEY UPDATE`,
    );
    const matches = await tx.$queryRaw<Array<{ id: string; name: string }>>(
      Prisma.sql`SELECT id,name FROM "Brand" WHERE "tenantId"=${tenantId} AND ("normalizationKey"=${key} OR upper(btrim(name))=${key}) ORDER BY id LIMIT 2`,
    );
    if (matches.length > 1)
      throw new SettingsValidationError({ brandName: "ambiguous_brand" });
    if (matches.length) return matches[0];
    const id = randomUUID();
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "Brand" (id,"tenantId",name,"normalizationKey",ownership) VALUES (${id},${tenantId},${name.trim()},${key},'UNKNOWN')`,
    );
    const actionId = randomUUID();
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId",action,"entityType","entityId","idempotencyKey",after) VALUES (${actionId},${tenantId},${actorId},'BRAND_CREATED','brand',${id},${actionId},${JSON.stringify({ name: name.trim(), ownership: "UNKNOWN" })}::jsonb)`,
    );
    return { id, name: name.trim() };
  });
}
