import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { payloadHash } from "@/lib/connectors/order-storage";
import { prisma } from "@/lib/prisma";
import type { SqlClient, SqlDatabase } from "@/lib/connectors/database";
import {
  defaultClientSettings,
  validateClientSettings,
  validateEntitySettings,
  SettingsValidationError,
  type SettingsResource,
  type ClientMerchandisingSettings,
} from "./merchandising-settings";
import {
  resolveMerchandisingPolicy,
  type PolicyInputs,
} from "./merchandising-policy";
export const CLIENT_SETTINGS_KEY = "settings:client";
interface Config {
  id: string;
  revision: number;
  values: unknown;
}
const tables = {
  brand: "Brand",
  sku: "Sku",
  supplier: "Supplier",
  category: "Category",
} as const;
/** Read only the explicitly activated client profile; defaults do not verify source mappings. */
export async function readClientSettings(
  tenantId: string,
  db: SqlClient = prisma,
) {
  const [row] = await db.$queryRaw<Config[]>(
    Prisma.sql`SELECT id,revision,values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "configType"='GENERAL' AND key=${CLIENT_SETTINGS_KEY} AND "isActive" AND "approvedAt" IS NOT NULL`,
  );
  return {
    id: row?.id ?? null,
    revision: row?.revision ?? 0,
    values: row ? validateClientSettings(row.values) : defaultClientSettings(),
  };
}
/** Resolve current SKU policy and preserve the settings versions consumed by the server preview. */
export async function getEffectiveSkuSettings(
  tenantId: string,
  skuId: string,
  db: SqlClient = prisma,
) {
  const client = await readClientSettings(tenantId, db);
  const [row] = await db.$queryRaw<
    Array<
      PolicyInputs & {
        id: string;
        brandId: string | null;
        categoryId: string | null;
        configIds: unknown;
      }
    >
  >(Prisma.sql`SELECT s.id,b.id "brandId",s."categoryId",s."ownershipOverride",s."commissionRateOverride"::text "commissionRateOverride",b.ownership "brandOwnership",b."commissionRate"::text "brandCommissionRate",COALESCE(s."supplierId",b."supplierId") "supplierId",sup."leadTimeDays" "leadDays",sup."coverDays",sup.moq,(sup."termsVerifiedAt" IS NOT NULL) "supplierTermsVerified",cat."seasonMonths",
  (SELECT jsonb_object_agg(c.key,c.id) FROM "MerchandisingConfig" c WHERE c."tenantId"=s."tenantId" AND c."configType"='GENERAL' AND c."isActive" AND c.key IN (${CLIENT_SETTINGS_KEY},'settings:sku:'||s.id,'settings:brand:'||b.id,'settings:supplier:'||sup.id,'settings:category:'||cat.id)) "configIds"
  FROM "Sku" s LEFT JOIN "Brand" b ON b.id=COALESCE(s."brandId",${client.values.profileMode === "MONOBRAND" ? client.values.monoBrandId : null}) AND b."tenantId"=s."tenantId" LEFT JOIN "Supplier" sup ON sup.id=COALESCE(s."supplierId",b."supplierId") AND sup."tenantId"=s."tenantId" LEFT JOIN "Category" cat ON cat.id=s."categoryId" AND cat."tenantId"=s."tenantId" WHERE s.id=${skuId} AND s."tenantId"=${tenantId}`);
  if (!row) throw new Error("ENTITY_NOT_FOUND");
  return {
    skuId,
    client,
    clientRevision: client.revision,
    configIds: row.configIds,
    policy: resolveMerchandisingPolicy(row, client.values),
  };
}
/** Bounded entity listing reuses existing tenant models and exposes each revision for optimistic edits. */
export async function listMerchandisingSettings(
  tenantId: string,
  resource: SettingsResource,
  page = 1,
  q = "",
  db: SqlClient = prisma,
) {
  const client = await readClientSettings(tenantId, db);
  const resourceQuery =
    resource === "client" ? null : Prisma.raw(`"${tables[resource]}"`);
  const columns =
    resource === "brand"
      ? Prisma.raw(
          'e.id,e.name,e.ownership,e."supplierId",e."commissionRate"::text',
        )
      : resource === "sku"
        ? Prisma.raw(
            'e.id,e.name,e.sku,e."brandId",e."supplierId",e."ownershipOverride",e."commissionRateOverride"::text',
          )
        : resource === "supplier"
          ? Prisma.raw(
              'e.id,e.name,e."leadTimeDays",e."coverDays",e.moq,e."termsVerifiedAt"',
            )
          : Prisma.raw('e.id,e.name,e."seasonMonths",e."seasonVerifiedAt"');
  const [items, counts, brands, suppliers, history] = await Promise.all([
    resourceQuery
      ? db.$queryRaw<Array<Record<string, unknown>>>(
          Prisma.sql`SELECT ${columns},COALESCE(c.revision,0) revision,CASE WHEN ${resource} IN ('brand','sku') THEN (to_jsonb(e)->>'commissionRate')::numeric*100 END "commissionPct",(to_jsonb(e)->>'commissionRateOverride')::numeric*100 "commissionOverridePct" FROM ${resourceQuery} e LEFT JOIN "MerchandisingConfig" c ON c."tenantId"=e."tenantId" AND c."configType"='GENERAL' AND c.key=${`settings:${resource}:`}||e.id AND c."isActive" WHERE e."tenantId"=${tenantId} AND (e.name ILIKE ${`%${q}%`} OR e.id=${q} OR to_jsonb(e)->>'sku' ILIKE ${`%${q}%`}) ORDER BY e.name,e.id LIMIT 25 OFFSET ${(page - 1) * 25}`,
        )
      : Promise.resolve([]),
    resourceQuery
      ? db.$queryRaw<Array<{ n: number }>>(
          Prisma.sql`SELECT count(*)::int n FROM ${resourceQuery} e WHERE e."tenantId"=${tenantId} AND (e.name ILIKE ${`%${q}%`} OR e.id=${q} OR to_jsonb(e)->>'sku' ILIKE ${`%${q}%`})`,
        )
      : Promise.resolve([{ n: 0 }]),
    db.$queryRaw<Array<{ id: string; name: string }>>(
      Prisma.sql`SELECT id,name FROM "Brand" WHERE "tenantId"=${tenantId} ORDER BY name LIMIT 500`,
    ),
    db.$queryRaw<Array<{ id: string; name: string }>>(
      Prisma.sql`SELECT id,name FROM "Supplier" WHERE "tenantId"=${tenantId} ORDER BY name LIMIT 500`,
    ),
    db.$queryRaw<
      Array<{
        action: string;
        entityType: string;
        entityId: string | null;
        createdAt: Date;
      }>
    >(
      Prisma.sql`SELECT action,"entityType","entityId","createdAt" FROM "MerchandisingAction" WHERE "tenantId"=${tenantId} AND action='SETTINGS_CHANGED' ORDER BY "createdAt" DESC,id DESC LIMIT 10`,
    ),
  ]);
  return {
    client,
    items,
    pagination: { page, pageSize: 25, totalRows: counts[0].n },
    brands,
    suppliers,
    history,
  };
}
/** Validate, audit and version one explicit administrative activation in a single tenant transaction. */
export async function saveMerchandisingSettings(
  tenantId: string,
  actorId: string,
  resource: SettingsResource,
  id: string | null,
  expectedRevision: number,
  values: unknown,
  db: SqlDatabase = prisma,
  options: { creationKey?: string } = {},
) {
  const valid =
    resource === "client"
      ? validateClientSettings(values)
      : validateEntitySettings(resource, values);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    throw new SettingsValidationError({ revision: "invalid_revision" });
  if (resource !== "client" && resource !== "supplier" && !id)
    throw new Error("ENTITY_NOT_FOUND");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR NO KEY UPDATE`,
    );
    const entityId =
        resource === "client"
          ? null
          : (id ?? options.creationKey ?? randomUUID()),
      key =
        resource === "client"
          ? CLIENT_SETTINGS_KEY
          : `settings:${resource}:${entityId}`;
    const [beforeConfig] = await tx.$queryRaw<Config[]>(
      Prisma.sql`SELECT id,revision,values FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND "configType"='GENERAL' AND key=${key} ORDER BY revision DESC LIMIT 1`,
    );
    if (
      resource === "supplier" &&
      id === null &&
      options.creationKey &&
      beforeConfig &&
      payloadHash(beforeConfig.values) === payloadHash(valid)
    )
      return {
        id: entityId,
        configId: beforeConfig.id,
        revision: beforeConfig.revision,
      };
    if ((beforeConfig?.revision ?? 0) !== expectedRevision)
      throw new Error("SETTINGS_CONFLICT");
    let before: unknown = beforeConfig?.values ?? null;
    if (resource === "client") {
      const client = valid as ClientMerchandisingSettings;
      if (client.monoBrandId) {
        const [brand] = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM "Brand" WHERE "tenantId"=${tenantId} AND id=${client.monoBrandId}`,
        );
        if (!brand)
          throw new SettingsValidationError({ monoBrandId: "choose_brand" });
      }
    } else {
      const table = Prisma.raw(`"${tables[resource]}"`);
      const [entity] = await tx.$queryRaw<Array<Record<string, unknown>>>(
        Prisma.sql`SELECT * FROM ${table} WHERE "tenantId"=${tenantId} AND id=${entityId} FOR NO KEY UPDATE`,
      );
      if (resource === "supplier" && id === null && !entity) {
        const [collision] = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM "Supplier" WHERE id=${entityId}`,
        );
        if (collision) throw new Error("SETTINGS_CONFLICT");
      }
      if (!entity && !(resource === "supplier" && id === null))
        throw new Error("ENTITY_NOT_FOUND");
      before = entity ?? null;
      if (resource === "brand" || resource === "sku") {
        const v = valid as Record<string, unknown>;
        if (v.supplierId) {
          const [supplier] = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`SELECT id FROM "Supplier" WHERE "tenantId"=${tenantId} AND id=${String(v.supplierId)}`,
          );
          if (!supplier)
            throw new SettingsValidationError({
              supplierId: "choose_supplier",
            });
        }
        const rate =
          v.commissionPct === null
            ? null
            : new Prisma.Decimal(String(v.commissionPct)).div(100).toString();
        const ownerField = Prisma.raw(
            resource === "brand" ? "ownership" : '"ownershipOverride"',
          ),
          rateField = Prisma.raw(
            resource === "brand"
              ? '"commissionRate"'
              : '"commissionRateOverride"',
          );
        await tx.$executeRaw(
          Prisma.sql`UPDATE ${table} SET ${ownerField}=${v[resource === "brand" ? "ownership" : "ownershipOverride"]}::"StockOwnership",${rateField}=${rate}::numeric,"supplierId"=${v.supplierId as string | null} WHERE "tenantId"=${tenantId} AND id=${entityId}`,
        );
      } else if (resource === "supplier") {
        const v = valid as Record<string, unknown>;
        await tx.$executeRaw(
          Prisma.sql`INSERT INTO "Supplier" (id,"tenantId",key,name,"leadTimeDays","coverDays",moq,"termsVerifiedAt","updatedAt") VALUES (${entityId},${tenantId},${`manual:${entityId}`},${v.name as string},${v.leadDays as number},${v.coverDays as number},${v.moq as number},now(),now()) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,"leadTimeDays"=EXCLUDED."leadTimeDays","coverDays"=EXCLUDED."coverDays",moq=EXCLUDED.moq,"termsVerifiedAt"=now(),"updatedAt"=now() WHERE "Supplier"."tenantId"=${tenantId}`,
        );
      } else
        await tx.$executeRaw(
          Prisma.sql`UPDATE "Category" SET "seasonMonths"=${(valid as Record<string, unknown>).seasonMonths as number[]},"seasonVerifiedAt"=now(),"updatedAt"=now() WHERE "tenantId"=${tenantId} AND id=${entityId}`,
        );
    }
    const configId = randomUUID(),
      actionId = randomUUID(),
      revision = expectedRevision + 1;
    await tx.$executeRaw(
      Prisma.sql`UPDATE "MerchandisingConfig" SET "isActive"=false WHERE "tenantId"=${tenantId} AND "configType"='GENERAL' AND key=${key} AND "isActive"`,
    );
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values,"isActive","approvedById","approvedAt","approvalReference") VALUES (${configId},${tenantId},'GENERAL',${key},${revision},${JSON.stringify(valid)}::jsonb,true,${actorId},now(),${`settings-ui:${actionId}`})`,
    );
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "MerchandisingAction" (id,"tenantId","actorId","configId",action,"entityType","entityId","idempotencyKey",before,after) VALUES (${actionId},${tenantId},${actorId},${configId},'SETTINGS_CHANGED',${resource},${entityId},${actionId},${JSON.stringify(before)}::jsonb,${JSON.stringify(valid)}::jsonb)`,
    );
    await tx.$executeRaw(
      Prisma.sql`UPDATE "ConnectorRecalculation" SET state='WAITING_ENGINE',"requestedAt"=now(),"inputProvenance"="inputProvenance"||jsonb_build_object('settingsConfigId',${configId}::text,'settingsChangedAt',now()) WHERE "tenantId"=${tenantId}`,
    );
    return { id: entityId, configId, revision };
  });
}
