import "server-only";
import { Prisma } from "@prisma/client";
import type { PGlite } from "@electric-sql/pglite";
import { withCalculationSnapshot } from "./calculation-snapshot";
import type { SqlClient, SqlDatabase } from "./connectors/database";
import { readScreenSourceState, screenSourceKey, ScreenApiError, type ScreenSnapshot } from "./merchandising-snapshot";
import { stockHistoryDates } from "./stock-history";

const schema = {
  MerchandisingScreenFact: `"snapshotId" text, "tenantId" text, "lineId" text,
    "sourceId" text, "orderId" text, "skuId" text, sku text, name text,
    "brandId" text, "brandName" text, "categoryId" text, "categoryName" text,
    "channelId" text, "channelName" text, currency text, "productKind" text, kind text,
    "inCurrent" boolean, "inPriorYear" boolean, "businessDate" date, "isSupporting" boolean,
    revenue numeric(38,12), quantity numeric(38,12), "grossProfit" numeric(38,12)`,
  MerchandisingScreenSku: `"snapshotId" text, "tenantId" text, "skuId" text, "dailyId" text,
    details jsonb, PRIMARY KEY ("tenantId", "snapshotId", "skuId")`,
  SkuDaily: `id text, "tenantId" text, "skuId" text, currency text, classification text,
    quantity numeric(18,4), "stockCostValue" numeric(38,4), "stockRetailValue" numeric(38,4),
    active boolean, metrics jsonb, diagnostics jsonb, PRIMARY KEY (id, "tenantId", "skuId")`,
  InventorySnapshot: `"tenantId" text, "sourceId" text, "skuId" text, "snapshotDate" date,
    "importRunId" text, "sourceRecordKey" text, "observedAt" timestamptz,
    quantity numeric(18,4), "costPrice" numeric(18,4), currency text, timezone text,
    PRIMARY KEY ("tenantId", "sourceId", "skuId", "snapshotDate")`,
  DataImportRun: `id text, "tenantId" text, "sourceId" text, status text, PRIMARY KEY (id, "tenantId", "sourceId")`,
  MerchandisingConfig: `id text, "tenantId" text, "configType" text, key text, revision integer,
    values jsonb, PRIMARY KEY (id, "tenantId")`,
} as const;

type Table = keyof typeof schema;
type PublicationData = Record<Table, string>;

export async function readPublicationData(
  tenantId: string,
  snapshot: ScreenSnapshot,
  inputSetId: string,
  db: SqlDatabase,
) {
  return withCalculationSnapshot(db, async (tx) => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
    const source = await readScreenSourceState(tenantId, snapshot.sourceId, tx);
    if (!source || source.pending || screenSourceKey(source) !== snapshot.sourceStateKey)
      throw new ScreenApiError("PUBLISHED_SOURCE_CHANGED");
    const snapshotId = snapshot.snapshotId;
    const dates = JSON.stringify(stockHistoryDates(snapshot.stock.asOf).dates);
    const cohort = Prisma.sql`SELECT "skuId" FROM "MerchandisingScreenSku"
      WHERE "tenantId"=${tenantId} AND "snapshotId"=${snapshotId}`;
    const history = Prisma.sql`FROM "InventorySnapshot" i
      WHERE i."tenantId"=${tenantId} AND i."sourceId"=${snapshot.sourceId}
      AND i."observedAt"<${new Date(snapshot.stock.cutoff)}
      AND i."skuId" IN (${cohort})
      AND i."snapshotDate" IN (SELECT value::date FROM jsonb_array_elements_text(${dates}::jsonb))`;
    const selects: Record<Table, Prisma.Sql> = {
      MerchandisingScreenFact: Prisma.sql`SELECT "snapshotId","tenantId","lineId","sourceId","orderId",
        "skuId",sku,name,"brandId","brandName","categoryId","categoryName","channelId","channelName",
        currency,"productKind",kind,"inCurrent","inPriorYear","businessDate","isSupporting",revenue,quantity,"grossProfit"
        FROM "MerchandisingScreenFact" WHERE "tenantId"=${tenantId} AND "snapshotId"=${snapshotId}`,
      MerchandisingScreenSku: Prisma.sql`SELECT "snapshotId","tenantId","skuId","dailyId",details
        FROM "MerchandisingScreenSku" WHERE "tenantId"=${tenantId} AND "snapshotId"=${snapshotId}`,
      SkuDaily: Prisma.sql`SELECT d.id,d."tenantId",d."skuId",d.currency,d.classification,d.quantity,
        d."stockCostValue",d."stockRetailValue",d.active,d.metrics,d.diagnostics
        FROM "SkuDaily" d JOIN "MerchandisingScreenSku" s
        ON s."dailyId"=d.id AND s."skuId"=d."skuId" AND s."tenantId"=d."tenantId"
        WHERE s."tenantId"=${tenantId} AND s."snapshotId"=${snapshotId}`,
      InventorySnapshot: Prisma.sql`SELECT i."tenantId",i."sourceId",i."skuId",i."snapshotDate",
        i."importRunId",i."sourceRecordKey",i."observedAt",i.quantity,i."costPrice",i.currency,i.timezone ${history}`,
      DataImportRun: Prisma.sql`SELECT id,"tenantId","sourceId",status FROM "DataImportRun"
        WHERE "tenantId"=${tenantId} AND "sourceId"=${snapshot.sourceId}
        AND id IN (SELECT i."importRunId" ${history})`,
      MerchandisingConfig: Prisma.sql`SELECT id,"tenantId","configType",key,revision,values
        FROM "MerchandisingConfig" WHERE "tenantId"=${tenantId} AND id IN (${snapshotId},${inputSetId})`,
    };
    const result = {} as PublicationData;
    let bytes = 0;
    for (const table of Object.keys(schema) as Table[]) {
      const [row] = await tx.$queryRaw<Array<{ json: string }>>(Prisma.sql`
        SELECT COALESCE(jsonb_agg(to_jsonb(records)),'[]'::jsonb)::text json
        FROM (${selects[table]}) records`);
      result[table] = row.json;
      bytes += Buffer.byteLength(row.json);
      if (bytes > 32 * 1024 * 1024)
        throw new ScreenApiError("PUBLICATION_INPUT_LIMIT", 422);
    }
    return JSON.stringify(result);
  });
}

function queryClient(client: Pick<PGlite, "query">): SqlClient {
  return {
    $queryRaw: async <T>(query: Prisma.Sql) => (await client.query(query.text, query.values)).rows as T,
    $executeRaw: async (query) => (await client.query(query.text, query.values)).affectedRows ?? 0,
  };
}

export async function withPublicationDatabase<T>(text: string, run: (db: SqlDatabase) => Promise<T>) {
  const data = JSON.parse(text) as PublicationData;
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  try {
    await pg.exec(Object.entries(schema).map(([name, columns]) =>
      `CREATE TABLE "${name}" (${columns});`,
    ).join("\n"));
    for (const table of Object.keys(schema) as Table[]) {
      await pg.query(
        `INSERT INTO "${table}" SELECT * FROM jsonb_populate_recordset(NULL::"${table}", $1::jsonb)`,
        [data[table]],
      );
    }
    return await run({
      ...queryClient(pg),
      $transaction: (callback) => pg.transaction((tx) => callback(queryClient(tx))),
    });
  } finally {
    await pg.close();
  }
}
