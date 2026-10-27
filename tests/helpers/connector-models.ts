import { Prisma } from "@prisma/client";
export function connectorModels(sql: any) {
  const findUnique = async ({ where }: any) => {
    const k = where.tenantId_provider;
    const [row] = (await sql.$queryRaw(
      Prisma.sql`SELECT c.*,s.timezone FROM "ConnectorConnection" c JOIN "DataSource" s ON s.id=c."sourceId" AND s."tenantId"=c."tenantId" WHERE c."tenantId"=${k.tenantId} AND c.provider=${k.provider}`,
    )) as any[];
    return row ? { ...row, source: { timezone: row.timezone } } : null;
  };
  return {
    ...sql,
    connectorConnection: {
      findUnique,
      upsert: async ({ create, update }: any) => {
        const existing = await findUnique({
          where: {
            tenantId_provider: {
              tenantId: create.tenantId,
              provider: create.provider,
            },
          },
        });
        if (existing)
          await sql.$executeRaw(
            Prisma.sql`UPDATE "ConnectorConnection" SET "sourceId"=${update.sourceId},"accountHost"=${update.accountHost},"encryptedConfig"=${update.encryptedConfig},"hasReceiptsKey"=${update.hasReceiptsKey},"hasYmlUrl"=${update.hasYmlUrl},revision=revision+1,"lastCheck"=NULL,capabilities=NULL,"updatedAt"=now() WHERE id=${existing.id}`,
          );
        else
          await sql.$executeRaw(
            Prisma.sql`INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId",provider,"accountHost","encryptedConfig","hasReceiptsKey","hasYmlUrl","updatedAt") VALUES (${crypto.randomUUID()},${create.tenantId},${create.sourceId},${create.provider},${create.accountHost},${create.encryptedConfig},${create.hasReceiptsKey},${create.hasYmlUrl},now())`,
          );
        return findUnique({
          where: {
            tenantId_provider: {
              tenantId: create.tenantId,
              provider: create.provider,
            },
          },
        });
      },
      updateMany: async ({ where, data }: any) => ({
        count: await sql.$executeRaw(
          Prisma.sql`UPDATE "ConnectorConnection" SET "lastCheck"=${JSON.stringify(data.lastCheck)}::jsonb,capabilities=${JSON.stringify(data.capabilities)}::jsonb,"checkedAt"=${data.checkedAt} WHERE "tenantId"=${where.tenantId} AND provider=${where.provider} AND revision=${where.revision}`,
        ),
      }),
    },
    dataSource: {
      upsert: async ({ create }: any) => {
        await sql.$executeRaw(
          Prisma.sql`INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey",name,timezone,"updatedAt") VALUES (${crypto.randomUUID()},${create.tenantId},${create.kind}::"DataSourceKind",${create.sourceKey},${create.name},${create.timezone},now()) ON CONFLICT("tenantId",kind,"sourceKey") DO NOTHING`,
        );
        const [row] = (await sql.$queryRaw(
          Prisma.sql`SELECT id,timezone FROM "DataSource" WHERE "tenantId"=${create.tenantId} AND kind=${create.kind}::"DataSourceKind" AND "sourceKey"=${create.sourceKey}`,
        )) as any[];
        return row;
      },
    },
  };
}
