import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import type { SqlClient, SqlDatabase } from "@/lib/connectors/database";
import type { OrderDto } from "@/lib/connectors/contract";
import { sourceDate, normalizeOrder } from "@/lib/connectors/order-normalization";
import { reserveRequest, retryAfter, budgetedFetcher } from "@/lib/connectors/budget";
import { storeOrder, payloadHash } from "@/lib/connectors/order-storage";
import { claimOrderJob, enqueueOrderImport, getOrderImportProgress, processOrderJob, resumeOrderImport } from "@/lib/connectors/order-jobs";
import { SalesDriveConnector, ConnectorReadError } from "@/lib/connectors/salesdrive";

let pg: PGlite, db: SqlDatabase;
function bridge(client: Pick<PGlite, "query">): SqlClient {
  return { $queryRaw: async <T,>(q: Prisma.Sql) => (await client.query(q.text, q.values)).rows as T,
    $executeRaw: async (q) => (await client.query(q.text, q.values)).affectedRows ?? 0 };
}
const fixtureCapabilities = { orders:true,products:false,stock:false,receipts:false,statuses:true,channels:"metadata",incrementalOrders:true,incrementalReceipts:false,historicalStock:false,writes:false } as const;
const observedAt = "2026-10-24T12:00:00.000Z";
const scope = { tenantId: "a", sourceId: "source-a", importRunId: "run-a", timezone: "Europe/Kyiv" };
function order(id = "1", version = 1, status = "5"): OrderDto {
  return { externalId: id, sourceVersion: version, observedAt, updatedAt: "2026-10-24 14:00:00", orderedAt: "2025-11-01 12:00:00", paidAt: "2025-11-02", statusId: status, channelId: "38",
    raw: { id, version, statusId: status, customer: "Synthetic fixture" },
    lines: [{ externalLineId: null, productId: "p1", sku: "SKU1", quantity: "2", unitPrice: "100", costPrice: "40", discount: "10", discountUnit: "percentage", commission: "0", commissionUnit: "amount" }] };
}
beforeAll(async () => {
  pg = new PGlite();
  const root = new URL("../../prisma/migrations/", import.meta.url);
  for (const name of (await readdir(root, { withFileTypes: true })).filter((x) => x.isDirectory()).map((x) => x.name).sort()) await pg.exec(await readFile(new URL(`${name}/migration.sql`, root), "utf8"));
  db = { ...bridge(pg), $transaction: async (callback) => pg.transaction(async (tx) => callback(bridge(tx))) };
  await pg.exec(`INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('a','A','a',now()),('b','B','b',now());
    INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('source-a','a','SALESDRIVE','demo.salesdrive.me',now()),('source-b','b','SALESDRIVE','other.salesdrive.me',now());
    INSERT INTO "ConnectorConnection" (id,"tenantId","sourceId","accountHost","encryptedConfig","updatedAt") VALUES ('conn-a','a','source-a','demo.salesdrive.me','encrypted',now()),('conn-b','b','source-b','other.salesdrive.me','encrypted',now());
    INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES ('run-a','a','source-a','MANUAL','SUCCESS','fixture',now(),now());`);
}, 30_000);
afterAll(async () => pg?.close());

describe("portable source hashes", () => {
  it("uses stable Unicode code-unit ordering through nested objects and arrays", () => {
    const expected = createHash("sha256").update('{"A":{"z":1,"ä":2},"a":[{"Z":1,"ß":2}],"z":3,"ä":4}').digest("hex");
    expect(payloadHash({ ä: 4, z: 3, a: [{ ß: 2, Z: 1 }], A: { ä: 2, z: 1 } })).toBe(expected);
    expect(payloadHash({ A: { z: 1, ä: 2 }, a: [{ Z: 1, ß: 2 }], z: 3, ä: 4 })).toBe(expected);
    expect(payloadHash([{ A: 1 }, { a: 2 }])).not.toBe(payloadHash([{ a: 2 }, { A: 1 }]));
  });
});
describe("source normalization", () => {
  it("rejects invalid, nonexistent and ambiguous local dates; retains day precision", () => {
    expect(sourceDate("2026-03-29 03:30:00", "Europe/Kyiv").date).toBeNull();
    expect(sourceDate("2026-10-25 03:30:00", "Europe/Kyiv").date).toBeNull();
    expect(sourceDate("2026-02-30", "Europe/Kyiv").date).toBeNull();
    expect(sourceDate("2026-10-25T03:30:00+03:00", "Europe/Kyiv").date?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    expect(sourceDate("2026-10-24", "Europe/Kyiv").precision).toBe("date");
  });
  it("retains all source amounts but requires approved mapping for financial inclusion", () => {
    const result = normalizeOrder(order(), "Europe/Kyiv");
    expect(result.lines[0]).toMatchObject({ netAmount: null, costAmount: null, returnedAt: null, dateInferred: false, identityDerived: true, kind: "UNKNOWN", sourceAmounts: { discount: "10", discountUnit: "percentage", unitCost: "40" } });
    const mapped = normalizeOrder(order(), "Europe/Kyiv", { statuses: { "5": "SALE" }, amounts: { price: "gross_unit", absoluteDiscount: "line", currency: "UAH", cost: "unit" } });
    expect(mapped.lines[0].netAmount?.toString()).toBe("180");
    expect(mapped.lines[0].costAmount?.toString()).toBe("80");
    const net = normalizeOrder(order(), "Europe/Kyiv", { amounts: { price: "net_unit", absoluteDiscount: "line", currency: "UAH" } });
    expect(net.lines[0].netAmount?.toString()).toBe("200");
  });
});
describe("SalesDrive page contract", () => {
  it("retains original JSON text and sends only documented history/order filters", async () => {
    const body = '{"data":[{"id":1,"version":2,"products":[{"amount":1,"price":12345678901234.1234}]}],"pagination":{"currentPage":1,"pageCount":1}}';
    const transport = vi.fn(async (_url: URL, _init: RequestInit) => new Response(body));
    const connector = new SalesDriveConnector({ accountHost: "demo.salesdrive.me", ordersApiKey: "synthetic", receiptsApiKey: null, ymlUrl: null }, transport);
    const page = await connector.getOrders({ orderedFrom: "2024-10-24T12:00:00Z", orderedTo: "2026-10-24T12:00:00Z", orderId: "1" });
    expect(page.rawResponse).toBe(body);
    expect(page.records[0].sourceVersion).toBe(2);
    expect(page.records[0].lines[0].unitPrice).toBe("12345678901234.1234");
    const url = transport.mock.calls[0][0] as URL;
    expect(url.searchParams.get("filter[orderTime][from]")).toBe("2024-10-24 15:00:00");
    expect(url.searchParams.get("filter[orderTime][to]")).toBe("2026-10-24 15:00:00");
    expect(url.searchParams.get("filter[id][to]")).toBe("1");
    expect(url.searchParams.get("filter[statusId]")).toBe("__ALL__");
  });
  it("rejects missing products and mismatched source pagination instead of clearing order lines", async () => {
    for (const body of [{ data: [{ id: 1 }], pagination: { pageCount: 1 } }, { data: [{ id: 1, products: [] }], pagination: { pageCount: 1, currentPage: 2 } }]) {
      const connector = new SalesDriveConnector({ accountHost: "demo.salesdrive.me", ordersApiKey: "synthetic", receiptsApiKey: null, ymlUrl: null }, async () => Response.json(body));
      await expect(connector.getOrders()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });
});
describe("durable raw and order projection", () => {
  it("is idempotent, replaces reordered/deleted lines, guards stale versions and preserves returns once", async () => {
    const original = order();
    expect((await db.$transaction((tx) => storeOrder(tx, scope, original))).outcome).toBe("imported");
    expect((await db.$transaction((tx) => storeOrder(tx, scope, original))).outcome).toBe("duplicate");
    const changed = order("1", 2, "7"); changed.lines.push({ ...changed.lines[0], productId: "p2" });
    await db.$transaction((tx) => storeOrder(tx, scope, changed, { statuses: { "7": "RETURN" } }));
    expect((await pg.query('SELECT kind,"returnedAt" FROM "OrderLine" WHERE "externalOrderId"=\'1\'')).rows).toEqual([{ kind: "RETURN", returnedAt: null }, { kind: "RETURN", returnedAt: null }]);
    expect((await db.$transaction((tx) => storeOrder(tx, scope, original))).outcome).toBe("stale");
    const empty = order("1", 3); empty.lines = []; await db.$transaction((tx) => storeOrder(tx, scope, empty));
    expect((await pg.query('SELECT count(*)::int n FROM "OrderLine" WHERE "externalOrderId"=\'1\'')).rows).toEqual([{ n: 0 }]);
    expect((await db.$transaction((tx) => storeOrder(tx, scope, changed))).outcome).toBe("stale");
    expect((await pg.query('SELECT count(*)::int n FROM "DataSourceRecord" WHERE resource=\'orders\'')).rows).toEqual([{ n: 3 }]);
  });
  it("quarantines invalid quantities/conflicting versions without damaging previous facts", async () => {
    const a = order("2"); await db.$transaction((tx) => storeOrder(tx, scope, a));
    const conflict = { ...a, raw: { ...a.raw, changed: true } };
    expect((await db.$transaction((tx) => storeOrder(tx, scope, conflict))).issues).toContain("ORDER_VERSION_CONFLICT");
    const bad = order("2", 2); bad.lines[0].quantity = null;
    expect((await db.$transaction((tx) => storeOrder(tx, scope, bad))).outcome).toBe("quarantined");
    expect((await pg.query('SELECT quantity FROM "OrderLine" WHERE "externalOrderId"=\'2\'')).rows).toEqual([{ quantity: "2.0000" }]);
  });
  it("reprojects unchanged source data when approved policies change", async () => {
    const value = order("policy");
    await db.$transaction((tx) => storeOrder(tx, scope, value));
    await db.$transaction((tx) => storeOrder(tx, scope, value, { statuses: { "5": "SALE" } }));
    expect((await pg.query('SELECT kind FROM "OrderLine" WHERE "externalOrderId"=\'policy\'')).rows).toEqual([{ kind: "SALE" }]);
  });
  it("re-resolves new or conflicting source aliases without changing the source payload", async () => {
    const value = order("alias");
    await db.$transaction((tx) => storeOrder(tx, scope, value));
    await pg.exec(`INSERT INTO "Sku" (id,"tenantId",sku,name,category,"priceRetail","pricePurchase") VALUES ('sku-one','a','one','One','fixture',1,1),('sku-two','a','two','Two','fixture',1,1);
      INSERT INTO "SkuAlias" (id,"tenantId","sourceId","skuId",type,value) VALUES ('alias-one','a','source-a','sku-one','SKU','SKU1');`);
    await db.$transaction((tx) => storeOrder(tx, scope, value));
    expect((await pg.query('SELECT "skuId" FROM "OrderLine" WHERE "externalOrderId"=\'alias\'')).rows).toEqual([{ skuId: "sku-one" }]);
    await pg.exec(`INSERT INTO "SkuAlias" (id,"tenantId","sourceId","skuId",type,value) VALUES ('alias-two','a','source-a','sku-two','SOURCE_PRODUCT_ID','p1')`);
    const result = await db.$transaction((tx) => storeOrder(tx, scope, value));
    expect(result.issues).toContain("SKU_ALIAS_CONFLICT");
    expect((await pg.query('SELECT "skuId" FROM "OrderLine" WHERE "externalOrderId"=\'alias\'')).rows).toEqual([{ skuId: null }]);
  });
  it("rolls back raw and normalized writes together and rejects cross-tenant provenance", async () => {
    await expect(db.$transaction(async (tx) => { await storeOrder(tx, scope, order("rollback")); throw new Error("interrupted"); })).rejects.toThrow("interrupted");
    expect((await pg.query('SELECT count(*)::int n FROM "OrderImportState" WHERE "externalOrderId"=\'rollback\'')).rows).toEqual([{ n: 0 }]);
    await expect(db.$transaction((tx) => storeOrder(tx, { ...scope, tenantId: "b" }, order("cross")))).rejects.toMatchObject({ code: "23503" });
  });
});
describe("shared rolling request budget", () => {
  it("reserves exactly ten/minute and releases at the exact boundary", async () => {
    const now = new Date(observedAt);
    for (let i = 0; i < 10; i++) expect(await reserveRequest(db, "minute", now)).toBeNull();
    expect((await reserveRequest(db, "minute", now))?.toISOString()).toBe("2026-10-24T12:01:00.000Z");
    expect(await reserveRequest(db, "minute", new Date(now.getTime() + 60_000))).toBeNull();
  });
  it("enforces hourly and daily limits even when the minute budget is free", async () => {
    const now = new Date(observedAt);
    await pg.exec(`INSERT INTO "ConnectorRequestBudget" ("accountKey") VALUES ('hour'),('day');
      INSERT INTO "ConnectorRequestAttempt" (id,"accountKey",at) SELECT 'hour-'||i,'hour', '2026-10-24T11:30:00Z'::timestamptz FROM generate_series(1,100) i;
      INSERT INTO "ConnectorRequestAttempt" (id,"accountKey",at) SELECT 'day-'||i,'day', '2026-10-24T00:00:00Z'::timestamptz FROM generate_series(1,1000) i;`);
    expect((await reserveRequest(db, "hour", now))?.toISOString()).toBe("2026-10-24T12:30:00.000Z");
    expect((await reserveRequest(db, "day", now))?.toISOString()).toBe("2026-10-25T00:00:00.000Z");
    expect(retryAfter("120", now).toISOString()).toBe("2026-10-24T12:02:00.000Z");
    expect(retryAfter("Sat, 24 Oct 2026 13:00:00 GMT", now).toISOString()).toBe("2026-10-24T13:00:00.000Z");
  });
});
describe("shared transport cooldown", () => {
  it("respects remote Retry-After across independent transport instances", async () => {
    const remote = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "120" } }));
    const fetcher = budgetedFetcher("cooldown.salesdrive.me", db, remote);
    await expect(fetcher(new URL("https://cooldown.salesdrive.me/api/order/list/"), {})).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const second = budgetedFetcher("cooldown.salesdrive.me", db, remote);
    await expect(second(new URL("https://cooldown.salesdrive.me/api/statuses/"), {})).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(remote).toHaveBeenCalledTimes(1);
  });
});
describe("queue checkpoints and worker", () => {
  const requests: unknown[] = [];
  let fail = false;
  const connector = new SalesDriveConnector({ accountHost: "demo.salesdrive.me", ordersApiKey: "synthetic", receiptsApiKey: null, ymlUrl: null }, async (url) => {
    requests.push(url.toString());
    if (fail) throw new ConnectorReadError("RATE_LIMITED", new Date(Date.now() + 120_000));
    if (url.pathname === "/api/statuses/") return Response.json({ data: [{ id: 5, name: "Paid" }] });
    const page = Number(url.searchParams.get("page"));
    return Response.json({ data: [{ id: 300 + page, version: 1, updateAt: "2026-10-24 14:00:00", orderTime: "2026-10-24 14:00:00", products: [{ amount: 1, price: 100 }] }], pagination: { pageCount: 2 } });
  });
  const runtime = async () => ({ sourceId: "source-a", revision: 1, timezone: "Europe/Kyiv", connector });
  it("persists each page, retries without advancing, then commits a completed cursor", async () => {
    const job = await enqueueOrderImport("a", "BACKFILL", {}, db);
    expect((await enqueueOrderImport("a", "BACKFILL", {}, db)).id).toBe(job.id);
    await processOrderJob("a", db, runtime);
    await processOrderJob("a", db, runtime);
    await processOrderJob("a", db, runtime);
    expect((await getOrderImportProgress("a", db))?.stats.pages).toBe(1);
    expect((await pg.query('SELECT * FROM "SyncCursor"')).rows).toHaveLength(0);
    fail = true; await processOrderJob("a", db, runtime); fail = false;
    expect((await getOrderImportProgress("a", db))).toMatchObject({ state: "RETRY", errorCode: "RATE_LIMITED", stats: { pages: 1 } });
    expect(await claimOrderJob(db, "a")).toBeNull();
    await pg.exec(`UPDATE "ConnectorSyncJob" SET "availableAt"=now() WHERE id='${job.id}'`);
    await processOrderJob("a", db, runtime);
    expect((await getOrderImportProgress("a", db))).toMatchObject({ state: "COMPLETE", stats: { pages: 2, orders: 2 } });
    expect((await pg.query('SELECT "lastSuccessfulRunId" FROM "SyncCursor"')).rows).toEqual([{ lastSuccessfulRunId: job.importRunId }]);
    expect(requests.some((r) => String(r).includes("orderTime"))).toBe(true);
    const inc = await enqueueOrderImport("a", "INCREMENTAL", {}, db);
    expect(new Date(inc.checkpoint.from).getTime()).toBe(new Date(job.checkpoint.to).getTime() - 2 * 3600_000);
  });
  it("fences expired leases and pauses on credential rotation without losing the checkpoint", async () => {
    const first = await claimOrderJob(db, "a"); expect(first).not.toBeNull();
    expect(await claimOrderJob(db, "a")).toBeNull();
    await pg.exec(`UPDATE "ConnectorSyncJob" SET "leaseExpiresAt"=now()-interval '1 second' WHERE id='${first!.id}'`);
    const second = await claimOrderJob(db, "a"); expect(second?.leaseToken).not.toBe(first?.leaseToken);
    await pg.exec(`UPDATE "ConnectorSyncJob" SET "leaseExpiresAt"=now()-interval '1 second'; UPDATE "ConnectorConnection" SET revision=2 WHERE "tenantId"='a'`);
    await processOrderJob("a", db, async () => ({ ...await runtime(), revision: 2 }));
    expect((await getOrderImportProgress("a", db))).toMatchObject({ state: "PAUSED", errorCode: "CONNECTOR_CONFIG_CHANGED" });
    expect(await resumeOrderImport("a", db)).toBe(1);
    expect((await getOrderImportProgress("a", db))?.state).toBe("PENDING");
    expect(await getOrderImportProgress("b", db)).toBeNull();
  });
  it("rejects an old worker after its lease is stolen before commit", async () => {
    const before = await getOrderImportProgress("a", db);
    const fake = { ...connector, getStatuses: async () => {
      await pg.exec(`UPDATE "ConnectorSyncJob" SET "leaseToken"='stolen', "leaseExpiresAt"=now()+interval '2 minutes' WHERE "tenantId"='a' AND state='RUNNING'`);
      return { entries: [], complete: true, reason: null };
    } } as unknown as SalesDriveConnector;
    await processOrderJob("a", db, async () => ({ ...await runtime(), revision: 2, connector: fake }));
    expect((await getOrderImportProgress("a", db))?.stats).toEqual(before?.stats);
    expect((await getOrderImportProgress("a", db))?.state).toBe("RUNNING");
    expect((await pg.query('SELECT "leaseToken" FROM "ConnectorSyncJob" WHERE "tenantId"=\'a\' ORDER BY "createdAt" DESC LIMIT 1')).rows).toEqual([{ leaseToken: "stolen" }]);
  });
  it("deduplicates webhook jobs queued behind a leased source", async () => {
    const event = { orderId: "301", eventKey: "a".repeat(64), payload: { synthetic: true } };
    const queued = await enqueueOrderImport("a", "WEBHOOK", event, db);
    expect(queued.state).toBe("PENDING");
    expect(await claimOrderJob(db,"a")).toBeNull();
    await pg.exec(`UPDATE "ConnectorSyncJob" SET state='COMPLETE', "leaseToken"=NULL, "leaseExpiresAt"=NULL WHERE "tenantId"='a' AND state='RUNNING'; UPDATE "DataImportRun" SET status='WARNING' WHERE "tenantId"='a' AND status='RUNNING'`);
    const one = await enqueueOrderImport("a", "WEBHOOK", event, db);
    expect((await enqueueOrderImport("a", "WEBHOOK", event, db)).id).toBe(one.id);
    expect((await pg.query('SELECT count(*)::int n FROM "DataSourceRecord" WHERE resource=\'order-webhooks\'')).rows).toEqual([{ n: 1 }]);
    const cursor = (await pg.query('SELECT checkpoint FROM "SyncCursor"')).rows;
    const fake = { provider:"salesdrive",capabilities:fixtureCapabilities,getOrders: async () => ({ records: [order("301", 4)], observedAt, nextPage: null }) } as unknown as SalesDriveConnector;
    await processOrderJob("a", db, async () => ({ ...await runtime(), revision: 2, connector: fake }));
    expect((await getOrderImportProgress("a", db))?.state).toBe("COMPLETE");
    expect((await pg.query('SELECT checkpoint FROM "SyncCursor"')).rows).toEqual(cursor);
    expect((await enqueueOrderImport("a", "WEBHOOK", event, db)).id).toBe(one.id);
  });

});

describe("page transaction recovery", () => {
  it("rolls back a partially written page and leaves its checkpoint unchanged through terminal failure", async () => {
    const job = await enqueueOrderImport("b", "BACKFILL", {}, db);
    const good = order("page-rollback"), invalid = order("missing-raw"); delete invalid.raw;
    const connector = { provider:"salesdrive",capabilities:fixtureCapabilities,getStatuses: async () => ({ entries: [], complete: true, reason: null }), getChannels: async () => ({ entries: [], complete: false, reason: null }),
      getOrders: async () => ({ records: [good, invalid], nextPage: null, observedAt }) } as unknown as SalesDriveConnector;
    const runtime = async () => ({ sourceId: "source-b", revision: 1, timezone: "Europe/Kyiv", connector });
    await processOrderJob("b", db, runtime); await processOrderJob("b", db, runtime);
    for (let i = 0; i < 8; i++) {
      await pg.exec(`UPDATE "ConnectorSyncJob" SET "availableAt"=now() WHERE id='${job.id}'`);
      await processOrderJob("b", db, runtime);
    }
    expect(await getOrderImportProgress("b", db)).toMatchObject({ state: "FAILED", stats: { pages: 0, orders: 0 } });
    expect((await pg.query('SELECT count(*)::int n FROM "DataSourceRecord" WHERE "tenantId"=\'b\' AND resource=\'orders\'')).rows).toEqual([{ n: 0 }]);
    expect((await pg.query('SELECT status FROM "DataImportRun" WHERE id=$1', [job.importRunId])).rows).toEqual([{ status: "FAILED" }]);
    expect((await pg.query('SELECT * FROM "SyncCursor" WHERE "tenantId"=\'b\'')).rows).toEqual([]);
    expect((await enqueueOrderImport("b", "BACKFILL", {}, db)).id).toBe(job.id);
    expect(await getOrderImportProgress("b", db)).toMatchObject({ id: job.id, state: "FAILED" });
    expect((await pg.query('SELECT count(*)::int n FROM "ConnectorSyncJob" WHERE "tenantId"=\'b\'')).rows).toEqual([{ n: 1 }]);
    expect(await resumeOrderImport("b", db)).toBe(1);
    const recovered = { ...connector, getOrders: async () => ({ records: [good], nextPage: null, observedAt }) } as unknown as SalesDriveConnector;
    await processOrderJob("b", db, async () => ({ ...await runtime(), connector: recovered }));
    expect(await getOrderImportProgress("b", db)).toMatchObject({ id: job.id, state: "COMPLETE", stats: { pages: 1, orders: 1 } });
  });
});
describe("two-year import volume", () => {
  it("persists 10,000 synthetic orders across 100 bounded pages", async () => {
    const job = await enqueueOrderImport("b", "BACKFILL", {}, db);
    let requests = 0;
    const budget = async () => {
      expect(await reserveRequest(db, "volume", new Date(new Date(observedAt).getTime() + requests * 60_000))).toBeNull(); requests++;
    };
    const connector = {
      provider:"salesdrive",capabilities:fixtureCapabilities,
      getStatuses: async () => { await budget(); return { entries: [], complete: true, reason: null }; },
      getChannels: async () => { await budget(); return { entries: [], complete: false, reason: "unverified" }; },
      getOrders: async ({ page = 1 }: { page?: number }) => {
        await budget(); return { observedAt, records: Array.from({ length: 100 }, (_, i) => order(String((page - 1) * 100 + i + 1))), nextPage: page < 100 ? page + 1 : null };
      },
    } as unknown as SalesDriveConnector;
    for (let i = 0; i < 102; i++) await processOrderJob("b", db, async () => ({ sourceId: "source-b", revision: 1, timezone: "Europe/Kyiv", connector }));
    expect(requests).toBe(102);
    expect(await getOrderImportProgress("b", db)).toMatchObject({ state: "COMPLETE", stats: { pages: 100, orders: 10000, imported: 10000 } });
    expect((await pg.query('SELECT count(*)::int n FROM "OrderLine" WHERE "tenantId"=\'b\' AND "importRunId"=$1', [job.importRunId])).rows).toEqual([{ n: 10000 }]);
    expect((await pg.query('SELECT "lastSuccessfulRunId" FROM "SyncCursor" WHERE "tenantId"=\'b\'')).rows).toEqual([{ lastSuccessfulRunId: job.importRunId }]);
  }, 120_000);
});
