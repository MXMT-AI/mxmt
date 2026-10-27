import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OverviewContent from "@/components/overview/OverviewContent";
import {
  overviewContributors,
  readSalesComparisons,
} from "@/lib/merchandising-overview";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("next/link", () => ({
  default: ({ children, ...props }: Record<string, unknown>) =>
    createElement("a", props, children as string),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { createScreenDb, screenSelection } from "../helpers/screen-db";
import {
  createScreenSnapshot,
  readScreenSnapshot,
} from "@/lib/merchandising-snapshot";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import { parseScreenQuery } from "@/lib/merchandising-screen-query";
import { financialDecimal as D } from "@/lib/merchandising-policy";
import {
  saveMerchandisingSettings,
  readClientSettings,
} from "@/lib/merchandising-settings-store";
let fixture: Awaited<ReturnType<typeof createScreenDb>>, id: string;
beforeAll(async () => {
  fixture = await createScreenDb();
  const client = await readClientSettings("a", fixture.db);
  await saveMerchandisingSettings(
    "a",
    "owner",
    "client",
    null,
    client.revision,
    {
      ...client.values,
      planCurrency: "UAH",
      monthlyPlans: { "2026-09": "200" },
    },
    fixture.db,
  );
  id = (await createScreenSnapshot("a", screenSelection, fixture.db))
    .snapshotId;
}, 30000);
afterAll(async () => fixture?.pg.close());
async function read(
  filters: Record<string, string> = {},
  screen = "overview" as
    | "overview"
    | "stock"
    | "repricing"
    | "reordering"
    | "sales",
) {
  return getMerchandisingScreen(
    "a",
    screen,
    parseScreenQuery(
      new URLSearchParams({ snapshotId: id, ...filters }),
      screen,
    ),
    fixture.db,
    screenSelection.now,
  );
}
describe("Overview O1–O8 pinned read model", () => {
  it("uses pace rather than raw attainment for a partial-month color", async () => {
    const half = await createScreenSnapshot(
      "a",
      { ...screenSelection, dateTo: "2026-09-15" },
      fixture.db,
    );
    const data = await read({ snapshotId: half.snapshotId, currency: "UAH" });
    expect(data.sales!.summary[0].plan.attainmentPct).toBe("0.55");
    expect(data.sales!.summary[0].plan.pacePct).toBe("1.1");
    expect(data.overview!.byCurrency[0].planTone).toBe("GREEN");
  });
  it("honors the exact 5% O1 threshold and keeps only the matching direction", () => {
    const brands = [
      { id: "up", name: "Up", delta: "5", oneOffLy: true },
      { id: "down", name: "Down", delta: "-50", oneOffLy: false },
    ];
    expect(overviewContributors("0.049999999999999999", brands)).toEqual([]);
    expect(overviewContributors("0.05", brands).map((b) => b.id)).toEqual([
      "up",
    ]);
    expect(overviewContributors("-0.05", brands).map((b) => b.id)).toEqual([
      "down",
    ]);
    expect(overviewContributors(null, brands)).toEqual([]);
  });
  it.each(["uk", "en"] as const)(
    "renders O1–O8 with pinned links and localized labels in %s",
    async (lang) => {
      const data = await read({ currency: "UAH" });
      const html = renderToStaticMarkup(
        createElement(OverviewContent, {
          data,
          lang,
          query:
            "period=month&dateFrom=2026-09-01&dateTo=2026-09-30&channelId=1",
          monobrand: false,
        }),
      );
      expect(html).toContain(
        lang === "uk" ? "Ключові показники" : "Key metrics",
      );
      expect(html).toContain("snapshotId=" + id);
      expect(html).toContain("classification=DEAD");
      expect(html).toContain("brandId=brand-a");
      expect(html).toContain("metric=revenue");
      expect(html).toContain("metric=gmPct");
      expect(html).toContain("mode=shortage");
      expect(html).toContain('role="img"');
      expect(html).not.toContain(
        lang === "uk" ? "Історія неповна;" : "History is incomplete;",
      );
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("Infinity");
    },
  );
  it("links a missing plan to Settings even for a stock-only currency", async () => {
    const data = await read();
    const html = renderToStaticMarkup(
      createElement(OverviewContent, {
        data,
        lang: "en",
        query: "",
        monobrand: false,
      }),
    );
    expect(data.sales!.summary.some((s) => s.currency === "USD")).toBe(false);
    expect(html).toContain("Set a plan");
  });
  it("hides dead-stock actions for a zero-dead view and links missing plans to Settings", async () => {
    const data = await read({ currency: "UAH", brandId: "brand-b" });
    data.sales!.summary[0].plan.target = null;
    const html = renderToStaticMarkup(
      createElement(OverviewContent, {
        data,
        lang: "en",
        query: "brandId=brand-b&currency=UAH",
        monobrand: true,
      }),
    );
    expect(html).toContain("No dead stock");
    expect(html).not.toContain("classification=DEAD");
    expect(html).toContain("Set a plan");
    expect(html).toContain("groupBy=category");
  });
  it("shows a new-period state when known LY revenue is zero", async () => {
    const data = await read({ currency: "UAH", skuId: "sku-c" });
    expect(data.sales!.summary[0].comparisonReason).toBe("LY_NON_POSITIVE");
    expect(data.sales!.summary[0].ly.revenue).toBe("0");
    const html = renderToStaticMarkup(
      createElement(OverviewContent, {
        data,
        lang: "en",
        query: "skuId=sku-c&currency=UAH",
        monobrand: false,
      }),
    );
    expect(html).toContain("New period");
    expect(html).not.toContain("Infinity");
  });
  it("does not invent zero LY months when history is unproven and falls back to the plan", async () => {
    const checkpoint = (
      await fixture.pg.query<{ checkpoint: unknown }>(
        `SELECT checkpoint FROM "ConnectorSyncJob" WHERE id='orders-job'`,
      )
    ).rows[0].checkpoint;
    try {
      await fixture.pg.exec(
        `UPDATE "ConnectorSyncJob" SET checkpoint=jsonb_set(checkpoint,'{from}','"2026-01-01T00:00:00+02:00"') WHERE id='orders-job'`,
      );
      const fresh = await createScreenSnapshot(
        "a",
        screenSelection,
        fixture.db,
      );
      const data = await read({
        snapshotId: fresh.snapshotId,
        currency: "UAH",
      });
      expect(data.overview!.history.ly).toBe(false);
      expect(data.overview!.byCurrency[0].contributors).toEqual([]);
      expect(data.overview!.byCurrency[0].trend![0].ly.revenue).toBeNull();
      const html = renderToStaticMarkup(
        createElement(OverviewContent, {
          data,
          lang: "en",
          query: "currency=UAH",
          monobrand: false,
        }),
      );
      expect(html).toContain("Achieved 55% of the plan");
      expect(html).toContain("History is incomplete;");
    } finally {
      await fixture.pg.query(
        `UPDATE "ConnectorSyncJob" SET checkpoint=$1 WHERE id='orders-job'`,
        [JSON.stringify(checkpoint)],
      );
    }
  });
  it("does not label unknown dead-stock cost as zero or invent an O8 winner", async () => {
    try {
      await fixture.pg.exec(
        `UPDATE "InventorySnapshot" SET "costPrice"=NULL WHERE id='sku-d:2026-10-25'`,
      );
      const fresh = await createScreenSnapshot(
        "a",
        screenSelection,
        fixture.db,
      );
      const data = await read({
        snapshotId: fresh.snapshotId,
        currency: "USD",
      });
      const block = data.overview!.byCurrency[0];
      expect(block.deadShare).toBeNull();
      expect(block.bottleneck).toBeNull();
      expect(
        block.statuses.find((s) => s.status === "DEAD")!.stockCost,
      ).toBeNull();
      const html = renderToStaticMarkup(
        createElement(OverviewContent, {
          data,
          lang: "en",
          query: "currency=USD",
          monobrand: false,
        }),
      );
      expect(html).toContain(
        "Largest bottleneck unavailable: incomplete stock cost",
      );
    } finally {
      await fixture.pg.exec(
        `UPDATE "InventorySnapshot" SET "costPrice"=8 WHERE id='sku-d:2026-10-25'`,
      );
    }
  });
  it("uses the same revenue, orders and monthly point as the Sales detail", async () => {
    const overview = await read(),
      details = await read({ currency: "UAH" }, "sales");
    const sale = overview.sales!.summary.find((s) => s.currency === "UAH")!;
    expect(sale.current).toEqual(details.sales!.summary[0].current);
    const block = overview.overview!.byCurrency.find(
      (b) => b.currency === "UAH",
    )!;
    expect(block.trend).toHaveLength(9);
    expect(block.trend![8].current.revenue).toBe(sale.current.revenue);
    expect(block.trend![8].ly.revenue).toBe(sale.ly.revenue);
    expect(block.trend![0].current.revenue).toBe("0");
    expect(block.planTone).toBe("RED");
  });
  it("returns the top directional contributors and strict greater-than-half LY outliers", async () => {
    const data = await read({ currency: "UAH" });
    const contributors = data.overview!.byCurrency[0].contributors;
    expect(contributors.map((b) => [b.id, b.delta, b.oneOffLy])).toEqual([
      ["brand-b", "20", true],
      [null, "10", false],
    ]);
  });
  it("qualifies LY one-offs within each selected category and currency, including unassigned categories", async () => {
    const isolated = await createScreenDb();
    try {
      const fresh = await createScreenSnapshot(
        "a",
        screenSelection,
        isolated.db,
      );
      const snapshot = await readScreenSnapshot(
        "a",
        fresh.snapshotId,
        isolated.db,
      );
      await isolated.pg.query(
        `DELETE FROM "MerchandisingScreenFact" WHERE "snapshotId"=$1`,
        [fresh.snapshotId],
      );
      const cohorts = [
        { category: "cat-a", currency: "UAH", revenues: [80, 20] },
        { category: "cat-b", currency: "UAH", revenues: [50, 50] },
        { category: "cat-a", currency: "USD", revenues: [50, 50] },
        { category: null, currency: "UAH", revenues: [60, 40] },
      ];
      for (const [cohortIndex, cohort] of cohorts.entries()) {
        for (const [orderIndex, revenue] of cohort.revenues.entries()) {
          const line = `cohort-${cohortIndex}-${orderIndex}`;
          await isolated.pg.query(
            `INSERT INTO "MerchandisingScreenFact" ("snapshotId","tenantId","lineId","sourceId","orderId","skuId","brandId","categoryId",currency,"productKind",kind,"inCurrent","inPriorYear","businessDate",revenue,quantity,"grossProfit")
          VALUES ($1,'a',$2,'source',$2,$2,'brand-a',$3,$4,'MERCHANDISE','SALE',false,true,'2025-09-10',$5,1,0)`,
            [fresh.snapshotId, line, cohort.category, cohort.currency, revenue],
          );
        }
      }
      const q = parseScreenQuery(
        new URLSearchParams({ snapshotId: fresh.snapshotId }),
        "overview",
      );
      const categories = await readSalesComparisons(
        "a",
        snapshot,
        q,
        isolated.db,
        "category",
      );
      expect(categories.map((r) => [r.id, r.currency, r.oneOffLy])).toEqual([
        ["cat-a", "UAH", true],
        ["cat-b", "UAH", false],
        [null, "UAH", true],
        ["cat-a", "USD", false],
      ]);
      const brands = await readSalesComparisons(
        "a",
        snapshot,
        q,
        isolated.db,
        "brand",
      );
      expect(brands.every((r) => !r.oneOffLy)).toBe(true);
      await isolated.pg.query(
        `UPDATE "MerchandisingScreenFact" SET revenue=800 WHERE "snapshotId"=$1 AND "lineId"='cohort-0-0'`,
        [fresh.snapshotId],
      );
      const afterLargePurchase = await readSalesComparisons(
        "a",
        snapshot,
        q,
        isolated.db,
        "category",
      );
      expect(
        afterLargePurchase.map((r) => [r.id, r.currency, r.oneOffLy]),
      ).toEqual(categories.map((r) => [r.id, r.currency, r.oneOffLy]));
      const flaggedBrand = await readSalesComparisons(
        "a",
        snapshot,
        q,
        isolated.db,
        "brand",
      );
      expect(flaggedBrand.find((r) => r.currency === "UAH")!.oneOffLy).toBe(
        true,
      );
    } finally {
      await isolated.pg.close();
    }
  });
  it("does not flag a LY order at exactly half of the full brand-month revenue", async () => {
    try {
      await fixture.pg.exec(
        `UPDATE "OrderLine" SET "signedRevenue"=50 WHERE "tenantId"='a' AND "externalOrderId"='one' AND "skuId"='sku-a'`,
      );
      const fresh = await createScreenSnapshot(
        "a",
        screenSelection,
        fixture.db,
      );
      const data = await read({
        snapshotId: fresh.snapshotId,
        currency: "UAH",
      });
      expect(
        data.overview!.byCurrency[0].contributors.find(
          (b) => b.id === "brand-a",
        )!.oneOffLy,
      ).toBe(false);
      expect(
        data.overview!.byCurrency[0].contributors.find(
          (b) => b.id === "brand-b",
        )!.oneOffLy,
      ).toBe(true);
    } finally {
      await fixture.pg.exec(
        `UPDATE "OrderLine" SET "signedRevenue"=40 WHERE "tenantId"='a' AND "externalOrderId"='one' AND "skuId"='sku-a'`,
      );
    }
  });
  it("keeps dead-stock card, structure and Repricing filters on the same status/value", async () => {
    const data = await read({ currency: "UAH" });
    const dead = data.overview!.byCurrency[0].statuses.find(
      (s) => s.status === "DEAD",
    )!;
    const details = await read(
      { currency: "UAH", classification: "DEAD" },
      "stock",
    );
    const action = await read(
      { currency: "UAH", classification: "DEAD" },
      "repricing",
    );
    expect(dead.stockCost).toBe(details.stock!.summary.byCurrency[0].stockCost);
    expect(dead.skuCount).toBe(details.stock!.summary.skuCount);
    expect(dead.stockCost).toBe(action.stock!.summary.byCurrency[0].stockCost);
  });
  it("keeps all-channel stock, ownership and bottleneck unchanged by the sales channel", async () => {
    const shop = await read({ channelId: "1" }),
      site = await read({ channelId: "2" });
    expect(shop.sales!.summary[0].current.revenue).not.toBe(
      site.sales!.summary[0].current.revenue,
    );
    for (let i = 0; i < shop.overview!.byCurrency.length; i++) {
      expect(shop.overview!.byCurrency[i].statuses).toEqual(
        site.overview!.byCurrency[i].statuses,
      );
      expect(shop.overview!.byCurrency[i].ownership).toEqual(
        site.overview!.byCurrency[i].ownership,
      );
      expect(shop.overview!.byCurrency[i].bottleneck).toEqual(
        site.overview!.byCurrency[i].bottleneck,
      );
    }
  });
  it("ranks O8 by dead stock but reports the full brand's exact inventory and STR", async () => {
    const data = await read({ currency: "UAH" });
    const focus = data.overview!.byCurrency[0].bottleneck!;
    expect(focus.brandId).toBe("brand-a");
    const brand = await read(
      { currency: "UAH", brandId: focus.brandId! },
      "stock",
    );
    expect(focus.stockCost).toBe(brand.stock!.summary.byCurrency[0].stockCost);
    expect(focus.quantity).toBe(brand.stock!.summary.byCurrency[0].quantity);
    expect(focus.firstReceiptDate).toBe("2025-01-01");
    expect(
      data.overview!.byCurrency[0].ownership.find(
        (o) => o.ownership === "UNKNOWN",
      )!.unknownBrands,
    ).toBe(1);
  });
  it("counts shortage once and keeps status money separated by currency", async () => {
    const data = await read(),
      action = await read({}, "reordering");
    const blocks = data.overview!.byCurrency;
    expect(
      blocks.reduce(
        (n, b) => n + b.statuses.reduce((s, r) => s + r.shortageSkuCount, 0),
        0,
      ),
    ).toBe(action.stock!.summary.shortageSkuCount);
    for (const block of blocks) {
      const total = data.stock!.summary.byCurrency.find(
        (s) => s.currency === block.currency,
      )!;
      expect(
        block.statuses
          .reduce((n, s) => n.add(s.coveredStockCost), D(0))
          .toString(),
      ).toBe(total.coveredStockCost);
    }
  });
});
