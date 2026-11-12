import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { parseCsvOptions } from "@/lib/connectors/csv/compile";
import { parseCsv } from "@/lib/connectors/csv/parser";
import { previewCsv, csvImportAction, readCsvImport } from "@/lib/connectors/csv/store";
import { processCsvJob } from "@/lib/connectors/csv/worker";
import { listConnectorSources, selectConnectorSource } from "@/lib/connectors/source";
import { processConnectorRecalculation } from "@/lib/connectors/recalculation";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import { parseScreenQuery } from "@/lib/merchandising-screen-query";
import { getProductQuality } from "@/lib/product-quality";
import { saveProductKind } from "@/lib/product-normalization";
import { csvOptions } from "../fixtures/csv-connector";
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
  const { pg, db } = await createMerchandisingDb();
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
  } finally {
    await pg.close();
    vi.unstubAllEnvs();
  }
}, 30000);
