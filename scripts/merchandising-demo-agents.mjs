import { createHash } from "node:crypto";

export async function seedDemoAgentData(db, tenantId, fixture, checksum) {
  const source = "la310-agent-source";
  const run = "la310-agent-" + checksum.slice(0, 24);
  await db.transaction(async (tx) => {
    await tx.query(`
      INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey",name,"updatedAt")
      VALUES ($1,$2,'CSV','LA-310','LA-310',now())
    `, [source, tenantId]);
    await tx.query(`
      INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey",
        "businessDate","sourceChecksum","completedAt","updatedAt")
      VALUES ($1,$2,$3,'MANUAL','SUCCESS',$1,$4::date,$5,now(),now())
    `, [run, tenantId, source, fixture.asof, checksum]);
    await tx.query(`
      INSERT INTO "SourceProduct" (id,"tenantId","importRunId","sourceRowNumber","productId",article,name,
        brand,category,"retailPrice","costPrice","stockUnits","sourceValues")
      SELECT 'la310-product:' || p.pid,$1,$2,p.row,p.pid,p.sku,p.name,p.brand,p.category,
        p.price,p.cost,p.stock,jsonb_build_object('synthetic',true,'ownership',p.ownership)
      FROM jsonb_to_recordset($3::jsonb)
        AS p(row int,pid text,sku text,name text,brand text,category text,price numeric,cost numeric,
          stock numeric,ownership text)
    `, [tenantId, run, JSON.stringify(fixture.products.map((p, index) => ({ ...p, row: index + 1 })))]);
    const ownership = new Map(fixture.products.map((product) => [product.pid, product.ownership]));
    const sales = fixture.events.map((event, index) => ({
      ...event,
      row: index + 1,
      hash: createHash("sha256").update(JSON.stringify(event)).digest("hex"),
      sign: event.status === 7 ? -1 : 1,
      consignment: ownership.get(event.pid) === "CONSIGNMENT",
    }));
    await tx.query(`
      INSERT INTO "SourceSaleLine" (id,"tenantId","importRunId","sourceRowNumber","sourceLineId","orderId",
        "rowHash","paymentDate","statusId","productSku","sourceProductId","resolvedProductId",
        "normalizedQuantity","normalizedSales","normalizedCost","sourceValues")
      SELECT 'la310-sale:' || s.id,$1,$2,s.row,s."lineId",s.id,s.hash,s.date,s.status,s.sku,s.pid,s.pid,
        s.qty * s.sign,s.unit * s.qty * s.sign,
        CASE WHEN s.consignment THEN s.unit * 0.6 ELSE s.cost END * s.qty * s.sign,
        jsonb_build_object('sajt',s.channel,'synthetic',true)
      FROM jsonb_to_recordset($3::jsonb) AS s(id text,row int,"lineId" text,hash text,date date,
        status int,sku text,pid text,qty numeric,unit numeric,cost numeric,channel int,sign int,consignment boolean)
    `, [tenantId, run, JSON.stringify(sales)]);
    await tx.query(`UPDATE "DataSource" SET "activeImportRunId"=$1 WHERE id=$2`, [run, source]);
  });
}
