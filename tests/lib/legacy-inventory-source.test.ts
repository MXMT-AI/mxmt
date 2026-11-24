import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
const state = vi.hoisted(() => ({
  pg: null as any,
  reads: [] as any[],
  findSkus: vi.fn<() => Promise<unknown[]>>(async () => []),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-tenant-id": "a" }),
  cookies: async () => ({ get: () => ({ value: "en" }) }),
}));
vi.mock("@/lib/server-auth", () => ({
  requireApiUser: async () => ({
    user: { tenantId: "a", userId: "owner", role: "ADMIN" },
    response: null,
  }),
}));
vi.mock("@/lib/ai", () => ({ chat: async () => '{"chips":[]}' }));
vi.mock("@/components/analyst/analyst-app/analyst-app", () => ({ default: () => null }));
vi.mock("@/components/dashboard/sales-sparkline/sales-sparkline", () => ({
  default: () => null,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: async ({ text, values }: { text: string; values: unknown[] }) =>
      (await state.pg.query(text, values)).rows,
    inventorySnapshot: {
      findMany: async (args: any) => {
        const parameters: any[] = [args.where.tenantId];
        let condition = "";
        if (Object.hasOwn(args.where, "sourceId")) {
          if (args.where.sourceId === null)
            condition = 'AND "sourceId" IS NULL';
          else {
            parameters.push(args.where.sourceId);
            condition = 'AND "sourceId"=$2';
          }
        }
        const result = await state.pg.query(
          `SELECT DISTINCT ON ("skuId") "skuId","qtyOnHand",quantity FROM "InventorySnapshot" WHERE "tenantId"=$1 ${condition} ORDER BY "skuId","snapshotDate" DESC`,
          parameters,
        );
        state.reads.push(result.rows);
        return result.rows.map((r: any) => ({
          ...r,
          sku: {
            productKind: "MERCHANDISE",
            brand: { id: "brand-a", name: "Brand A" },
          },
        }));
      },
    },
    sku: { findMany: state.findSkus },
    salesRecord: { groupBy: async () => [], findMany: async () => [] },
    onboardingBrief: { findUnique: async () => null },
    tenant: { findUnique: async () => ({ name: "A" }) },
    googleDriveSync: { findFirst: async () => null },
    catalogItem: { count: async () => 0 },
  },
}));
import { createScreenDb } from "../helpers/screen-db";
import Analyst from "@/components/analyst/analyst-page/analyst-page";
import Dashboard from "@/components/dashboard/dashboard-page/dashboard-page";
import { GET as stock } from "@/app/api/calendar/stock/route";
import { GET as insights } from "@/app/api/calendar/insights/route";
import { POST as plan } from "@/app/api/calendar/ai-plan/route";
import { GET as classify } from "@/app/api/analyst/classify/route";
let f: Awaited<ReturnType<typeof createScreenDb>>;
beforeAll(async () => {
  f = await createScreenDb();
  state.pg = f.pg;
  await f.pg
    .exec(`INSERT INTO "InventorySnapshot" (id,"tenantId","skuId","snapshotDate","qtyOnHand") VALUES ('legacy','a','sku-a','2026-10-25',7);
 INSERT INTO "DataSource" (id,"tenantId",kind,"sourceKey","updatedAt") VALUES ('csv','a','CSV','csv',now());
 INSERT INTO "DataImportRun" (id,"tenantId","sourceId",trigger,status,"idempotencyKey","businessDate","updatedAt") VALUES ('csv','a','csv','MANUAL','SUCCESS','csv',now(),now());
 INSERT INTO "InventorySnapshot" (id,"tenantId","skuId","snapshotDate","sourceId","importRunId","sourceRecordKey","observedAt",timezone,quantity) VALUES ('csv','a','sku-a','2026-10-26','csv','csv','raw','2026-10-26T08:00:00Z','Europe/Kyiv',999);`);
}, 30000);
beforeEach(() => {
  state.reads = [];
  state.findSkus.mockReset();
});
afterAll(async () => f?.pg.close());
it.each([
  ["analyst page", () => Analyst()],
  ["dashboard page", () => Dashboard()],
  ["calendar stock", () => stock()],
  ["calendar insights", () => insights()],
  ["calendar AI plan", () => plan()],
  [
    "analyst classify",
    () => classify(new NextRequest("https://app.test/api/analyst/classify")),
  ],
] as const)(
  "%s uses only legacy stock, even with newer CSV/SalesDrive observations for the same SKU",
  async (_name, run) => {
    const result = await run();
    expect(state.reads).toEqual([
      [{ skuId: "sku-a", qtyOnHand: 7, quantity: null }],
    ]);
    if (_name === "calendar stock")
      expect(await (result as Response).json()).toEqual([
        { brand: "Brand A", stock: 7, woh: null, status: "ok" },
      ]);
  },
);

it("uses the same eligible SKUs and counts on first render and refresh", async () => {
  const sku = {
    id: "sku-a",
    sku: "A",
    name: "Alpha",
    category: "Category A",
    productKind: "MERCHANDISE",
    brand: { name: "Brand A", leadTimeDays: 10 },
    priceRetail: 20,
    pricePurchase: 10,
  };
  state.findSkus.mockResolvedValue([
    sku,
    { ...sku, id: "sku-b", sku: "B", name: "No legacy snapshot" },
  ]);

  const page = await Analyst();
  const url = "https://app.test/api/analyst/classify";
  const result = await (await classify(new NextRequest(url))).json();

  expect(result.skus).toMatchObject([{ id: "sku-a", stock: 7, flag: "dead" }]);
  expect(result.skus).toHaveLength(1);
  expect(result.summary).toEqual({ total: 1, hit: 0, stockout: 0, slow: 0, dead: 1, ok: 0 });
  expect(page.props.initialSkus).toEqual(result.skus);
  expect(page.props.initialSummary).toEqual(result.summary);

  const filtered = await (await classify(new NextRequest(`${url}?flag=ok`))).json();
  expect(filtered).toEqual({ skus: [], summary: result.summary });
});
