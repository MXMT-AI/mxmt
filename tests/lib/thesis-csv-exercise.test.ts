import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { appendFile, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { parseCsvOptions } from "@/lib/connectors/csv/compile";
import { parseCsv } from "@/lib/connectors/csv/parser";
import { previewCsv, csvImportAction, readCsvImport } from "@/lib/connectors/csv/store";
import { processCsvJob } from "@/lib/connectors/csv/worker";
import { listConnectorSources, selectConnectorSource } from "@/lib/connectors/source";
import { processConnectorRecalculation } from "@/lib/connectors/recalculation";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import { configuredReportStorage } from "@/lib/merchandising-publication-storage";
import {
  publishMerchandisingReports,
  readPublishedScreen,
  readPublishedReorderingPreview,
  readPublishedRepricingPreview,
  readReportPublication,
} from "@/lib/merchandising-publication";
import { parseRepricingRequest } from "@/lib/repricing";
import { getRepricingPreview } from "@/lib/repricing-store";
import { getReorderingPreview } from "@/lib/reordering-store";
import { parseReorderingRequest } from "@/lib/reorder-calc";
import { parseScreenQuery } from "@/lib/merchandising-screen-query";
import { getProductQuality } from "@/lib/product-quality";
import { saveProductKind } from "@/lib/product-normalization";
import { csvFile, csvOptions } from "../fixtures/csv-connector";
import { createMerchandisingDb } from "../helpers/merchandising-db";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

it("runs the documented thesis CSV exercise in a new workspace", async () => {
  const files = (["products", "stock", "orders"] as const).map((resource) => {
    const bytes = readFileSync(new URL(`../../public/training-data/${resource}.csv`, import.meta.url));
    const { headers } = parseCsv(bytes, ",");
    return {
      resource,
      bytes: bytes.toString("base64"),
      delimiter: ",",
      columns: Object.fromEntries(headers.map((header) => [header, header])),
    };
  });
  const options = parseCsvOptions({
    ...csvOptions,
    history: { from: "2026-08-31T21:00:00.000Z", to: "2026-09-30T20:59:59.999Z", complete: true },
    discountUnit: "percentage",
    policy: {
      ...csvOptions.policy,
      channels: { "38": "Інтернет-магазин", "68": "Маркетплейс", "78": "Шоурум Київ", "79": "Instagram" },
      amounts: { ...csvOptions.policy.amounts, price: "net_unit" },
    },
  });
  const directory = await mkdtemp(join(tmpdir(), "mxmt-thesis-reports-"));
  const { pg, db } = await createMerchandisingDb();
  let closed = false;
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("MERCHANDISING_PUBLISHED_TENANTS", "training");
  vi.stubEnv("MERCHANDISING_PUBLICATION_DIR", directory);
  vi.stubEnv("CONNECTOR_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
  try {
    const tenantId = "training";
    const actorId = "training-admin";
    await pg.exec(`
      INSERT INTO "Tenant" (id,name,slug,"updatedAt") VALUES ('training','Training','training',now());
      INSERT INTO "User" (id,email,"passwordHash",name,role,"tenantId","updatedAt")
      VALUES ('training-admin','training@example.test','test','Training admin','ADMIN','training',now());
    `);

    const preview = await previewCsv(tenantId, actorId, null, options, files, db);
    expect(preview.state).toBe("READY");
    expect(preview.preview.errors).toEqual([]);
    expect(preview.preview.counts).toMatchObject({ products: 6, stock: 180, orders: 26 });

    const sources = await listConnectorSources(tenantId, db);
    expect(sources.sourceId).toBeNull();
    expect(sources.connections).toEqual([
      expect.objectContaining({ sourceId: preview.sourceId, provider: "csv", selectable: true }),
    ]);
    await selectConnectorSource(tenantId, actorId, preview.sourceId, sources.revision, db);

    const queued = await csvImportAction(tenantId, actorId, preview.id, preview.contentHash, "activate", db);
    expect(queued.state).toBe("QUEUED");
    expect(await processCsvJob(tenantId, db)).toMatchObject({ processed: true });
    expect(await readCsvImport(tenantId, preview.id, db)).toMatchObject({ state: "ACTIVE" });
    const quality = await getProductQuality(tenantId, { page: 1, q: "DEMO-" }, db);
    expect(quality.rows).toHaveLength(6);
    for (const row of quality.rows) {
      await saveProductKind(tenantId, actorId, row.id, "MERCHANDISE", db);
    }
    expect(await processConnectorRecalculation(tenantId, db)).toMatchObject({ phase: "DAILY", published: true });
    expect(await processConnectorRecalculation(tenantId, db)).toMatchObject({ phase: "SALES", published: true });

    const now = new Date("2026-11-12T10:00:00Z");
    const snapshot = await createScreenSnapshot(tenantId, { dateFrom: "2026-09-01", dateTo: "2026-09-30", asOf: "2026-09-30", now }, db);
    const params = new URLSearchParams({ snapshotId: snapshot.snapshotId });
    const overview = await getMerchandisingScreen(tenantId, "overview", parseScreenQuery(params, "overview"), db, now);
    const sales = await getMerchandisingScreen(tenantId, "sales", parseScreenQuery(params, "sales"), db, now);
    const stock = await getMerchandisingScreen(tenantId, "stock", parseScreenQuery(params, "stock"), db, now);
    expect(overview.context).toMatchObject({ asOf: "2026-09-30" });
    expect(overview.overview?.history).toMatchObject({ current: true, ly: false });
    expect(sales.sales?.summary[0]?.current).toMatchObject({ revenue: "37551", units: "36", returnOrderCount: 1 });
    expect(stock.stock?.summary.byCurrency[0]).toMatchObject({ quantity: "93" });

    const storage = configuredReportStorage(tenantId)!;
    const active = (await readReportPublication(tenantId, storage))!;
    expect(active).toMatchObject({
      dataVersion: 1,
      dateFrom: "2026-09-01", dateTo: "2026-09-30", asOf: "2026-09-30",
    });
    await expect(publishMerchandisingReports(tenantId, {
      dateFrom: "2026-09-01", dateTo: "2026-10-01",
    }, storage, db)).rejects.toMatchObject({ code: "PUBLISHED_DATE_INCOMPLETE" });

    const selected = new URLSearchParams({ snapshotId: active.snapshotId });
    const filteredReports = await Promise.all((["overview", "sales", "stock"] as const).map(async (name) => {
      const query = parseScreenQuery(new URLSearchParams({
        ...Object.fromEntries(selected), currency: "UAH", groupBy: "sku", page: "2", pageSize: "1",
        ...(name === "stock" ? { categoryPage: "2", sort: "quantity", direction: "desc" } : { channelId: "38" }),
      }), name);
      const expected = await getMerchandisingScreen(tenantId, name, query, db, new Date(active.publishedAt));
      return { name, query, expected };
    }));
    const priceRequest = parseRepricingRequest({
      inputSetId: active.repricingInputSetId, parameters: { sharePct: 50 }, pageSize: 2,
    });
    const orderRequest = parseReorderingRequest({
      snapshotId: active.snapshotId, mode: "all", parameters: { coverDays: 60 }, pageSize: 2,
    });
    const expectedPricing = await getRepricingPreview(tenantId, priceRequest, db);
    const expectedOrder = await getReorderingPreview(tenantId, orderRequest, db);
    const records = (resource: "products" | "orders") => {
      const file = files.find((row) => row.resource === resource)!;
      return parseCsv(Buffer.from(file.bytes, "base64"), ",").rows.map((row) => row.cells);
    };
    const products = records("products");
    const stockForOctober = products.map(({ productId }) => ({
      productId,
      observedAt: "2026-10-01T20:50:00Z",
      quantity: "20",
    }));
    const newOrder = {
      orderId: "DEMO-OCTOBER-01", eventId: "DEMO-OCTOBER-01", lineId: "DEMO-OCTOBER-01",
      productId: products[0].productId, sku: products[0].sku, statusId: "5", channelId: "38",
      orderedAt: "2026-10-01", paidAt: "2026-10-01", returnedAt: "",
      updatedAt: "2026-10-01T20:50:00Z", quantity: "2", unitPrice: "990", discount: "0", costPrice: "430",
    };
    const nextFiles = [
      csvFile("products", products.map((product) => ({ ...product, observedAt: "2026-10-01T20:50:00Z" }))),
      csvFile("stock", stockForOctober),
      csvFile("orders", [...records("orders"), newOrder]),
    ];
    const nextOptions = {
      ...options,
      history: { ...options.history!, to: "2026-10-01T20:59:59.999Z" },
    };
    const nextImport = await previewCsv(tenantId, actorId, preview.sourceId, nextOptions, nextFiles, db);
    expect(nextImport).toMatchObject({ state: "READY", preview: { counts: { stock: 6, orders: 27 } } });
    expect(nextImport.id).not.toBe(preview.id);
    await csvImportAction(tenantId, actorId, nextImport.id, nextImport.contentHash, "activate", db);
    expect(await processCsvJob(tenantId, db)).toEqual({ processed: true });
    expect(await readCsvImport(tenantId, nextImport.id, db)).toMatchObject({ state: "ACTIVE" });
    expect(await processConnectorRecalculation(tenantId, db)).toMatchObject({ phase: "DAILY", published: true });
    expect(await processConnectorRecalculation(tenantId, db)).toMatchObject({ phase: "SALES", published: true });
    expect(await readReportPublication(tenantId, storage)).toEqual(active);
    const beforeRefresh = await readPublishedScreen(tenantId, "overview", parseScreenQuery(selected, "overview"), storage);
    expect(beforeRefresh?.sales?.summary[0]?.current.revenue).toBe("37551");
    expect(beforeRefresh?.stock?.summary.byCurrency[0]?.quantity).toBe("93");

    const retriedImport = await previewCsv(tenantId, actorId, preview.sourceId, nextOptions, nextFiles, db);
    expect(retriedImport).toMatchObject({ id: nextImport.id, state: "ACTIVE" });
    expect(await processCsvJob(tenantId, db)).toEqual({ processed: false });

    const selection = { dateFrom: "2026-09-01", dateTo: "2026-10-01" };
    const publish = vi.spyOn(storage, "publish");
    const [newer, simultaneousRetry] = await Promise.all([
      publishMerchandisingReports(tenantId, selection, storage, db),
      publishMerchandisingReports(tenantId, selection, storage, db),
    ]);
    expect(publish.mock.results).toHaveLength(2);
    expect(await Promise.all(publish.mock.results.map(({ value }) => value))).toEqual(
      expect.arrayContaining([true, false]),
    );
    expect(newer.previous).toEqual(active);
    expect(simultaneousRetry).toEqual(newer);
    expect(await publishMerchandisingReports(tenantId, selection, storage, db)).toEqual(newer);
    expect(publish).toHaveBeenCalledTimes(2);
    publish.mockRestore();
    const refreshed = await readPublishedScreen(tenantId, "overview", parseScreenQuery(
      new URLSearchParams({ snapshotId: newer.snapshotId }), "overview",
    ), storage);
    expect(refreshed?.sales?.summary[0]?.current).toMatchObject({ revenue: "39531", units: "38" });
    expect(refreshed?.stock?.summary.byCurrency[0]?.quantity).toBe("120");

    const recovery = await mkdtemp(join(tmpdir(), "mxmt-thesis-recovery-"));
    try {
      await mkdir(join(recovery, "targets"));
      const backup = join(recovery, "backup");
      const restored = join(recovery, "targets", "restored");
      const recover = (action: string, source: string, target: string) =>
        spawnSync(process.execPath, ["scripts/merchandising-report-backup.mjs",
          action, tenantId, source, target], { encoding: "utf8" });
      expect(recover("backup", directory, backup).status).toBe(0);
      expect(recover("restore", backup, restored).status).toBe(0);
      expect(recover("restore", backup, restored).status).toBe(1);

      vi.stubEnv("MERCHANDISING_PUBLICATION_DIR", restored);
      const restoredStorage = configuredReportStorage(tenantId)!;
      expect(await readReportPublication(tenantId, restoredStorage)).toEqual(newer);

      const index = JSON.parse(await readFile(join(backup, "publication-backup.json"), "utf8"));
      const changed = Object.keys(index.checksums).find((path) => path.endsWith("/active.json"))!;
      await appendFile(join(backup, changed), "\n");
      const rejected = join(recovery, "targets", "rejected");
      const failure = recover("restore", backup, rejected);
      expect(failure.stderr).toContain("Backup verification failed");
      await expect(stat(rejected)).rejects.toMatchObject({ code: "ENOENT" });

      await pg.close();
      closed = true;
      const query = parseScreenQuery(new URLSearchParams({ snapshotId: newer.snapshotId }), "overview");
      expect(await readPublishedScreen(tenantId, "overview", query, restoredStorage)).toEqual(refreshed);
      const filtered = filteredReports.find(({ name }) => name === "sales")!;
      expect(await readPublishedScreen(tenantId, "sales", filtered.query, restoredStorage)).toEqual({
        ...JSON.parse(JSON.stringify(filtered.expected)), publishedAt: active.publishedAt,
      });
    } finally {
      await rm(recovery, { recursive: true, force: true });
    }

    expect(await readReportPublication(tenantId, storage)).toEqual(newer);
    expect(await readReportPublication("other-tenant", storage)).toBeNull();

    const cache = new Map<string, string>();
    const cacheRead = vi.fn(async (path: string) => cache.get(path) ?? null);
    const durableRead = vi.spyOn(storage, "read");
    storage.cache = {
      read: cacheRead,
      write: async (path, text) => cache.set(path, text),
    };
    const query = parseScreenQuery(new URLSearchParams({ snapshotId: active.snapshotId }), "overview");
    const report = await readPublishedScreen(tenantId, "overview", query, storage);
    expect(report?.sales?.summary[0]?.current.revenue).toBe("37551");
    expect(report?.stock?.summary.byCurrency[0]?.quantity).toBe("93");
    expect(cache.size).toBe(1);
    durableRead.mockClear();
    expect(await readPublishedScreen(tenantId, "overview", query, storage)).toEqual(report);
    expect(durableRead).toHaveBeenCalledTimes(1);
    expect(durableRead.mock.calls[0][0]).toMatch(/active\.json$/);
    cacheRead.mockRejectedValueOnce(new Error("Redis unavailable"));
    expect(await readPublishedScreen(tenantId, "overview", query, storage)).toEqual(report);
    expect((await readPublishedReorderingPreview(
      tenantId, parseReorderingRequest({ snapshotId: active.snapshotId }), storage,
    ))?.snapshotId).toBe(active.snapshotId);

    for (const { name, query, expected } of filteredReports) {
      const actual = await readPublishedScreen(tenantId, name, query, storage);
      expect(actual).toEqual({ ...JSON.parse(JSON.stringify(expected)), publishedAt: active.publishedAt });
    }
    expect(await readPublishedRepricingPreview(tenantId, priceRequest, storage))
      .toEqual(JSON.parse(JSON.stringify(expectedPricing)));
    expect(await readPublishedReorderingPreview(tenantId, orderRequest, storage))
      .toEqual(JSON.parse(JSON.stringify(expectedOrder)));
  } finally {
    if (!closed) await pg.close();
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
}, 30000);
