import { createHash, randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { readVerifiedBackup } from "./merchandising-report-backup.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function readAgentRuns(directory, tenantId, checksum, active) {
  const temp = await mkdtemp(join(tmpdir(), "mxmt-agent-backup-"));
  let local;
  try {
    const path = join(temp, "db");
    await cp(directory, path, { recursive: true });
    local = new PGlite(path);
    const { rows } = await local.query(`
      SELECT a.id, a."agentType", a."entityId", a.status, a.input, a.output,
        a."errorMsg", a."startedAt", a."finishedAt"
      FROM "AgentRun" a
      JOIN "DataImportRun" i ON i.id=a.input->>'importRunId' AND i."tenantId"=a."tenantId"
      JOIN "DataSource" s ON s.id=i."sourceId" AND s."tenantId"=a."tenantId"
      WHERE a."tenantId"=$1 AND i."sourceChecksum"=$2 AND s."sourceKey"='LA-310'
        AND a.input->>'asOf'=$3 AND a.input->>'dateFrom'=$4
        AND a.status IN ('done','error') AND a."finishedAt" IS NOT NULL
      ORDER BY a."startedAt"
    `, [tenantId, checksum, active.asOf, active.dateFrom]);
    if (!rows.some((run) => run.status === "done")) throw new Error("No matching saved LA-310 agent runs");
    return rows;
  } finally {
    try { if (local) await local.close(); } finally { await rm(temp, { recursive: true, force: true }); }
  }
}

export async function restoreWorkspace(db, tenantId, backup, fixturePath, agentDirectory) {
  const { active, files } = await readVerifiedBackup(backup, tenantId);
  const tenantHash = sha256(tenantId);
  const namespace = `merchandising/v1/${tenantHash}`;
  const fixtureBytes = await readFile(fixturePath);
  const fixture = JSON.parse(fixtureBytes);
  if (fixture.version !== "LA-310" || fixture.synthetic !== true || fixture.asof !== active.asOf)
    throw new Error("Expected the synthetic LA-310 dataset matching the active report");
  const checksum = sha256(fixtureBytes);
  const agentRuns = await readAgentRuns(agentDirectory, tenantId, checksum, active);
  const prefix = `la310-agents-${tenantHash.slice(0, 16)}`;
  const importRunId = `${prefix}-${checksum.slice(0, 24)}`;
  const inputData = JSON.parse(files.get(`${namespace}/${active.version}/data.json`).toString("utf8"));
  const snapshot = JSON.parse(inputData.MerchandisingConfig)
    .find((row) => row.id === active.snapshotId && row.tenantId === tenantId)?.values?.snapshot;
  if (!snapshot?.sourceId) throw new Error("Missing source for the backed-up report");
  active.agentSource = { importRunId, reportSourceId: snapshot.sourceId };
  const activePath = `${namespace}/active.json`;
  files.delete(activePath);
  files.set(`${namespace}/agent-input/${importRunId}.json`, fixtureBytes);
  files.set(activePath, Buffer.from(JSON.stringify(active)));

  await db.query("BEGIN");
  try {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`report-restore:${tenantId}`]);
    const { rows: [source] } = await db.query(
      'SELECT kind, "sourceKey" FROM "DataSource" WHERE id=$1 AND "tenantId"=$2',
      [snapshot.sourceId, tenantId],
    );
    if (source?.kind !== "CSV" || source.sourceKey !== "LA-310")
      throw new Error("The backed-up LA-310 report source is missing from this workspace");

    const { rows: [currentImport] } = await db.query(
      'SELECT "sourceChecksum" FROM "DataImportRun" WHERE id=$1 AND "tenantId"=$2',
      [importRunId, tenantId],
    );
    if (!currentImport) {
      await db.query(`
        INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey",
          "businessDate","sourceChecksum",stats,"completedAt","updatedAt")
        VALUES ($1,$2,$3,'MANUAL','SUCCESS',$1,$4::date,$5,'{"publishedAgentInput":true}'::jsonb,now(),now())
      `, [importRunId, tenantId, snapshot.sourceId, fixture.asof, checksum]);
    } else if (currentImport.sourceChecksum !== checksum) {
      throw new Error("The existing agent import does not match this dataset");
    }

    for (const run of agentRuns) {
      const inserted = await db.query(`
        INSERT INTO "AgentRun" (id,"tenantId","agentType","entityId",status,input,output,"errorMsg","startedAt","finishedAt")
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
        ON CONFLICT (id) DO NOTHING
      `, [run.id, tenantId, run.agentType, run.entityId, run.status,
        JSON.stringify({ ...run.input, importRunId }), run.output === null ? null : JSON.stringify(run.output),
        run.errorMsg, run.startedAt, run.finishedAt]);
      if (inserted.rowCount === 0) {
        const existing = await db.query(
          'SELECT id FROM "AgentRun" WHERE id=$1 AND "tenantId"=$2 AND input->>\'importRunId\'=$3',
          [run.id, tenantId, importRunId],
        );
        if (existing.rows.length !== 1) throw new Error("A saved agent run ID is already in use");
      }
    }

    for (const [path, bytes] of files) {
      const value = { compressed: gzipSync(bytes).toString("base64"), revision: sha256(bytes) };
      const key = `report-publication:${path}`;
      const inserted = await db.query(`
        INSERT INTO "MerchandisingConfig" (id,"tenantId","configType",key,revision,values)
        VALUES ($1,$2,'GENERAL',$3,1,$4::jsonb)
        ON CONFLICT ("tenantId","configType",key,revision) DO NOTHING
      `, [randomUUID(), tenantId, key, JSON.stringify(value)]);
      if (inserted.rowCount === 0) {
        const { rows: [existing] } = await db.query(`
          SELECT values->>'revision' AS revision FROM "MerchandisingConfig"
          WHERE "tenantId"=$1 AND "configType"='GENERAL' AND key=$2 AND revision=1
        `, [tenantId, key]);
        if (existing?.revision !== value.revision) throw new Error("The workspace already has a different publication");
      }
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
  return { dateFrom: active.dateFrom, dateTo: active.dateTo, files: files.size, agentRuns: agentRuns.length };
}

if (import.meta.main) {
  const [tenantId, backup, fixture, agentDirectory, ...extra] = process.argv.slice(2);
  if (!tenantId || !backup || !fixture || !agentDirectory || extra.length || !process.env.DATABASE_URL)
    throw new Error("Usage: node --env-file=.env scripts/merchandising-restore-workspace.mjs <tenant-id> <backup> <LA-310.json> <agent-db>");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  await db.connect();
  try {
    console.log(await restoreWorkspace(db, tenantId, backup, fixture, agentDirectory));
  } finally {
    await db.end();
  }
}
