import pg from "pg";

const season = "LA-310";
const auditKey = "demo-planner:LA-310";

export async function seedDemoPlanner(client, { tenantId, sourceId, commit = false }) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    const { rows: [source] } = await client.query(`
      SELECT s."activeImportRunId"
      FROM "Tenant" t
      JOIN "DataSource" s ON s."tenantId"=t.id
      JOIN "DataImportRun" r ON r.id=s."activeImportRunId" AND r."tenantId"=t.id AND r."sourceId"=s.id
      JOIN "ConnectorSelection" x ON x."tenantId"=t.id AND x."sourceId"=s.id
      WHERE t.id=$1 AND lower(t.slug) LIKE 'diploma-%' AND s.id=$2
        AND s.kind='CSV' AND s."sourceKey"='LA-310' AND r.status='SUCCESS'
      FOR UPDATE OF t, s`, [tenantId, sourceId]);
    if (!source) throw new Error("LA310_SOURCE_NOT_VERIFIED");

    const { rows: [existing] } = await client.query(`
      SELECT (SELECT count(*)::int FROM "CatalogUpload" WHERE "tenantId"=$1) catalogs,
        (SELECT count(*)::int FROM "CatalogItem" WHERE "tenantId"=$1) items,
        EXISTS (SELECT 1 FROM "PlannerCart" WHERE "tenantId"=$1 AND items<>'[]'::jsonb) cart,
        EXISTS (SELECT 1 FROM "MerchandisingAction" WHERE "tenantId"=$1 AND "idempotencyKey"=$2
          AND "entityId"=$3) seeded`, [tenantId, auditKey, sourceId]);
    if (existing.seeded) {
      await client.query("ROLLBACK");
      return { status: "already-seeded", catalogs: existing.catalogs, items: existing.items };
    }
    if (existing.catalogs || existing.items || existing.cart)
      throw new Error("LA310_PLANNER_ALREADY_IN_USE");

    await client.query(`
      CREATE TEMP TABLE mxmt_demo_catalog ON COMMIT DROP AS
      SELECT DISTINCT s.id, s.sku, s.name, s.category, s."brandId", s."pricePurchase", s."priceRetail",
        COALESCE(v.moq, b.moq) moq, COALESCE(v."leadTimeDays", b."leadTimeDays") "leadTimeDays"
      FROM "Sku" s JOIN "SkuAlias" a ON a."tenantId"=s."tenantId" AND a."skuId"=s.id
      JOIN "Brand" b ON b."tenantId"=s."tenantId" AND b.id=s."brandId"
      LEFT JOIN "Supplier" v ON v."tenantId"=s."tenantId" AND v.id=s."supplierId"
      WHERE s."tenantId"=$1 AND a."sourceId"=$2 AND s.sku LIKE 'LA-310-%'
        AND s."productKind"='MERCHANDISE' AND s."pricePurchase">0 AND s."priceRetail">0
        AND b.budget=0 AND b.currency IN ('UNKNOWN','EUR','UAH')
        AND EXISTS (SELECT 1 FROM "InventorySnapshot" i WHERE i."tenantId"=s."tenantId"
          AND i."sourceId"=a."sourceId" AND i."skuId"=s.id AND i.currency='UAH')`, [tenantId, sourceId]);
    const { rows: [verified] } = await client.query(`
      SELECT count(*)::int items, count(DISTINCT "brandId")::int catalogs FROM mxmt_demo_catalog`);
    if (verified.items !== 310 || verified.catalogs !== 30) throw new Error("LA310_PLANNER_INPUT_INCOMPLETE");

    await client.query(`
      UPDATE "Brand" SET currency='UAH' WHERE "tenantId"=$1 AND id IN (SELECT "brandId" FROM mxmt_demo_catalog)
        AND currency IN ('UNKNOWN','EUR')`, [tenantId]);
    await client.query(`
      INSERT INTO "CatalogUpload" (id,"tenantId","brandId",season,"fileName","itemCount")
      SELECT gen_random_uuid()::text,$1,"brandId",$2,'LA-310.json',count(*)::int
      FROM mxmt_demo_catalog GROUP BY "brandId"`, [tenantId, season]);
    const inserted = await client.query(`
      INSERT INTO "CatalogItem"
        (id,"tenantId","catalogId","brandId",sku,name,category,"priceWholesale","priceRetail","minOrder","leadTimeDays")
      SELECT gen_random_uuid()::text,$1,u.id,s."brandId",s.sku,s.name,s.category,
        s."pricePurchase",s."priceRetail",s.moq,s."leadTimeDays"
      FROM mxmt_demo_catalog s JOIN "CatalogUpload" u ON u."tenantId"=$1 AND u."brandId"=s."brandId" AND u.season=$2`,
    [tenantId, season]);
    if (inserted.rowCount !== verified.items) throw new Error("LA310_PLANNER_INSERT_INCOMPLETE");

    await client.query(`
      INSERT INTO "MerchandisingAction" (id,"tenantId",action,"entityType","entityId","idempotencyKey",context)
      VALUES (gen_random_uuid()::text,$1,'DEMO_PLANNER_SEEDED','DEMO_IMPORT',$2,$3,$4::jsonb)`,
    [tenantId, sourceId, auditKey, JSON.stringify({ importRunId: source.activeImportRunId, ...verified })]);
    await client.query(commit ? "COMMIT" : "ROLLBACK");
    return { status: commit ? "seeded" : "verified", ...verified };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

if (import.meta.main) {
  const [tenantId, sourceId, mode, ...extra] = process.argv.slice(2);
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!tenantId || !sourceId || !connectionString || extra.length || (mode && mode !== "--apply"))
    throw new Error("Usage: node --env-file=.env scripts/seed-la310-planner.mjs <tenant-id> <source-id> [--apply]");
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    console.log(await seedDemoPlanner(client, { tenantId, sourceId, commit: mode === "--apply" }));
  } finally {
    await client.end();
  }
}
