import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import type { PGlite } from "@electric-sql/pglite";
import type { SqlDatabase } from "@/lib/connectors/database";
import { processConnectorRecalculation } from "@/lib/connectors/recalculation";
import { calculateSkuDaily } from "@/lib/sku-daily-store";
import { getSalesReport } from "@/lib/sales-report";
import { createMerchandisingDb } from "../helpers/merchandising-db";
let pg: PGlite, db: SqlDatabase;
beforeAll(async () => {
  ({ pg, db } = await createMerchandisingDb());
}, 30000);
afterAll(async () => pg?.close());
async function seed(id: string) {
  await pg.query(
    `INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ($1,$1,$1,now())`,
    [id],
  );
  await pg.query(
    `INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ($1,$1,'SALESDRIVE',$1,now())`,
    [id],
  );
  await pg.query(
    `INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","updatedAt") VALUES ($1,$1,$1,'example.salesdrive.me','test',now())`,
    [id],
  );
  await pg.query(
    `INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES ($1,$1,$1,'MANUAL','SUCCESS',$1,now(),now())`,
    [id],
  );
  await pg.query(
    `INSERT INTO "ConnectorSyncJob" (id,"tenantId","sourceId","importRunId",resource,mode,state,"connectionRevision",checkpoint,"updatedAt") VALUES ($1,$1,$1,$1,'orders','INCREMENTAL','COMPLETE',1,'{}',now())`,
    [id],
  );
  await pg.query(
    `INSERT INTO "ConnectorRecalculation" ("importRunId","tenantId","sourceId","inputProvenance") VALUES ($1,$1,$1,'{}')`,
    [id],
  );
}
async function read(id: string) {
  return (
    await pg.query<{ state: string; inputProvenance: Record<string, unknown> }>(
      `SELECT state,"inputProvenance" FROM "ConnectorRecalculation" WHERE "tenantId"=$1`,
      [id],
    )
  ).rows[0];
}
describe("durable classification consumer", () => {
  it("publishes one phase per tick, saves immutable IDs and then becomes idle", async () => {
    await seed("phases");
    expect(await processConnectorRecalculation("foreign", db)).toEqual({
      processed: false,
    });
    expect(await processConnectorRecalculation("phases", db)).toMatchObject({
      phase: "DAILY",
      published: true,
    });
    expect(await read("phases")).toMatchObject({
      state: "PENDING",
      inputProvenance: {
        phase: "SALES",
        dailyCalculationId: expect.any(String),
      },
    });
    expect(await processConnectorRecalculation("phases", db)).toMatchObject({
      phase: "SALES",
      published: true,
    });
    expect(await read("phases")).toMatchObject({
      state: "COMPLETE",
      inputProvenance: {
        phase: "DONE",
        salesCalculationId: expect.any(String),
        inputConsistency: "separate-immutable-phase-calculations",
      },
    });
    expect(await processConnectorRecalculation("phases", db)).toEqual({
      processed: false,
    });
  });
  it("does not consume an intent while imports are incomplete", async () => {
    await seed("importing");
    await pg.exec(
      `UPDATE "ConnectorSyncJob" SET state='PENDING' WHERE id='importing'`,
    );
    expect(await processConnectorRecalculation("importing", db)).toEqual({
      processed: false,
    });
    await pg.exec(
      `UPDATE "ConnectorSyncJob" SET state='COMPLETE' WHERE id='importing'`,
    );
    expect(await processConnectorRecalculation("importing", db)).toMatchObject({
      published: true,
    });
  });
  it("retains retry state without leaking errors, waits five minutes and resumes its phase", async () => {
    await seed("failure");
    await processConnectorRecalculation("failure", db);
    const failure = vi.fn(async () => {
      throw new Error("secret database detail");
    });
    expect(
      await processConnectorRecalculation("failure", db, {
        daily: calculateSkuDaily,
        sales: failure,
      }),
    ).toMatchObject({ published: false, phase: "SALES" });
    const row = await read("failure");
    expect(row).toMatchObject({
      state: "FAILED",
      inputProvenance: {
        phase: "SALES",
        errorCode: "RECALCULATION_UNAVAILABLE",
      },
    });
    expect(JSON.stringify(row)).not.toContain("secret");
    expect(await processConnectorRecalculation("failure", db)).toEqual({
      processed: false,
    });
    await pg.exec(
      `UPDATE "ConnectorRecalculation" SET "inputProvenance"="inputProvenance"||jsonb_build_object('availableAt',now()-interval '1 second') WHERE "tenantId"='failure'`,
    );
    expect(await processConnectorRecalculation("failure", db)).toMatchObject({
      phase: "SALES",
      published: true,
    });
  });
  it("respects live leases, recovers expired work and refuses stale worker acknowledgments", async () => {
    await seed("lease");
    let reclaimed = false;
    const daily = vi.fn(
      async (...args: Parameters<typeof calculateSkuDaily>) => {
        expect(await processConnectorRecalculation("lease", db)).toEqual({
          processed: false,
        });
        await pg.exec(
          `UPDATE "ConnectorRecalculation" SET "inputProvenance"="inputProvenance"||jsonb_build_object('leaseUntil',now()-interval '1 second') WHERE "tenantId"='lease'`,
        );
        reclaimed =
          (await processConnectorRecalculation("lease", db)).published === true;
        return calculateSkuDaily(...args);
      },
    );
    expect(
      await processConnectorRecalculation("lease", db, {
        daily,
        sales: getSalesReport,
      }),
    ).toMatchObject({ phase: "DAILY", published: false });
    expect(reclaimed).toBe(true);
    expect((await read("lease")).state).toBe("PENDING");
  });
  it("restarts daily inputs after settings change, even midway through the sales phase", async () => {
    await seed("settings");
    await processConnectorRecalculation("settings", db);
    const sales = vi.fn(async (...args: Parameters<typeof getSalesReport>) => {
      await pg.exec(
        `UPDATE "ConnectorRecalculation" SET state='WAITING_ENGINE',"requestedAt"=now(),"inputProvenance"="inputProvenance"||jsonb_build_object('settingsChangedAt',now()) WHERE "tenantId"='settings'`,
      );
      return getSalesReport(...args);
    });
    expect(
      await processConnectorRecalculation("settings", db, {
        daily: calculateSkuDaily,
        sales,
      }),
    ).toMatchObject({ phase: "SALES", published: false });
    expect(await processConnectorRecalculation("settings", db)).toMatchObject({
      phase: "DAILY",
      published: true,
    });
  });
});
