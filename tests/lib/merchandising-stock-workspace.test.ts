import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: Record<string, unknown>) =>
    createElement("a", props, children as string),
}));
import StockContent from "@/components/stock/StockContent";
import { createStockWorkspaceDb } from "../helpers/stock-workspace-db";
import { screenSelection } from "../helpers/screen-db";
import { createScreenSnapshot } from "@/lib/merchandising-snapshot";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import { parseScreenQuery } from "@/lib/merchandising-screen-query";
import { financialDecimal as D } from "@/lib/merchandising-policy";
let fixture: Awaited<ReturnType<typeof createStockWorkspaceDb>>, id: string;
beforeAll(async () => {
  fixture = await createStockWorkspaceDb();
  id = (await createScreenSnapshot("a", screenSelection, fixture.db))
    .snapshotId;
}, 30000);
afterAll(async () => fixture?.pg.close());
async function read(
  values: Record<string, string> = {},
  screen: "stock" | "overview" = "stock",
) {
  return getMerchandisingScreen(
    "a",
    screen,
    parseScreenQuery(
      new URLSearchParams({ snapshotId: id, groupBy: "category", ...values }),
      screen,
    ),
    fixture.db,
    screenSelection.now,
  );
}
it("reconciles K1 ring amounts, gray remainder, category totals and O4 with explicit denominators", async () => {
  const data = await read({ currency: "UAH" }),
    stock = data.stockWorkspace!,
    block = stock.byCurrency[0];
  expect(stock.classificationVersion).toBe(2);
  expect(stock.channelScope).toBe("ALL_CHANNELS");
  expect(block.quantity).toBe(data.stock!.summary.byCurrency[0].quantity);
  const overview = (await read({ currency: "UAH" }, "overview")).overview!
    .byCurrency[0];
  for (const row of block.statuses)
    expect(
      overview.statuses.find((s) => s.status === row.status)?.stockCost,
    ).toBe(row.stockCost);
  const ring = block.statuses.filter((s) => s.inRing);
  expect(ring.reduce((sum, r) => sum.add(r.stockCost!), D(0)).toString()).toBe(
    block.ringCost,
  );
  expect(block.statuses.find((s) => s.status === "NEW")!.stockCost).toBe("500");
  expect(block.statuses.find((s) => s.status === "OFF_SEASON")!.stockCost).toBe(
    "21",
  );
  expect(
    block.statuses.find((s) => s.status === "SERVICE")!.stockCost,
  ).toBeNull();
  expect(block.grayCost).toBe("521");
  expect(D(block.ringCost!).add(block.grayCost!).toString()).toBe(
    block.stockCost,
  );
  expect(
    block.categories.rows
      .reduce((s, r) => s.add(r.stockCost!), D(0))
      .toString(),
  ).toBe(block.stockCost);
  expect(
    ring
      .reduce((s, r) => s.add(r.ringShare!), D(0))
      .sub(1)
      .abs()
      .lt("0.000000000000001"),
  ).toBe(true);
  expect(block.statuses.find((s) => s.status === "DEAD")!.overviewShare).toBe(
    overview.deadShare,
  );
  expect(block.statuses.find((s) => s.status === "DEAD")!.ringShare).not.toBe(
    overview.deadShare,
  );
  expect(
    block.statuses.filter((s) => s.inRing).some((s) => s.status === "OOS"),
  ).toBe(false);
  expect(stock.history.state).toBe("MVP_PLACEHOLDER");
});
it("verifies synthetic CITIZEN/CASIO/CHPO signals using the same daily rule and first receipt", async () => {
  const data = await read({ currency: "UAH" }),
    rows = data.stockWorkspace!.byCurrency[0].brands.rows;
  expect(rows.find((b) => b.name === "CITIZEN")?.signal).toBe("DEAD");
  expect(rows.find((b) => b.name === "CASIO")).toMatchObject({
    signal: "NEW",
    firstReceiptDate: "2026-10-07",
  });
  expect(rows.find((b) => b.name === "CHPO")?.signal).toBe("OFF_SEASON");
  expect(rows.find((b) => b.id === null)).toMatchObject({
    signal: "MISSING_BRAND",
    ownership: "UNKNOWN",
    warnings: ["OWNERSHIP_UNKNOWN"],
  });
  expect(rows.find((b) => b.name === "CITIZEN")!.weeksOnHand).not.toBeNull();
  expect(rows.find((b) => b.name === "CITIZEN")!.strComplete).toBe(true);
});
it("filters matching groups and sorts by the selected status without recomputing partial-brand WOH", async () => {
  const full = (await read({ currency: "UAH" })).stockWorkspace!.byCurrency[0],
    filtered = await read({
      currency: "UAH",
      classification: "RISK",
      groupBy: "sku",
    });
  const block = filtered.stockWorkspace!.byCurrency[0];
  expect(block.ringCost).toBe(full.ringCost);
  expect(block.categories.rows.every((r) => r.statusCounts.RISK > 0)).toBe(
    true,
  );
  expect(block.brands.rows.every((r) => r.statusCounts.RISK > 0)).toBe(true);
  const active = full.brands.rows.find((r) => r.name === "ACTIVE")!,
    selected = block.brands.rows.find((r) => r.name === "ACTIVE")!;
  expect(selected.weeksOnHand).toBe(active.weeksOnHand);
  expect(selected.quantity).toBe(active.quantity);
  expect(selected.signal).toBe(active.signal);
  expect(
    filtered.table!.rows.every(
      (r) => "classification" in r && r.classification === "RISK",
    ),
  ).toBe(true);
  expect(filtered.stockWorkspace!.categorySort).toBe("RISK");
});
it("retains every category and brand across independent pages, with per-currency top ten brands", async () => {
  const first = (await read({ currency: "UAH", pageSize: "3" })).stockWorkspace!
    .byCurrency[0];
  const categories = [...first.categories.rows],
    brands = [...first.brands.rows];
  for (let page = 2; page <= first.categories.pagination.totalPages; page++)
    categories.push(
      ...(
        await read({
          currency: "UAH",
          pageSize: "3",
          categoryPage: String(page),
        })
      ).stockWorkspace!.byCurrency[0].categories.rows,
    );
  for (let page = 2; page <= first.brands.pagination.totalPages; page++)
    brands.push(
      ...(
        await read({ currency: "UAH", pageSize: "3", brandPage: String(page) })
      ).stockWorkspace!.byCurrency[0].brands.rows,
    );
  expect(first.brands.rows).toHaveLength(10);
  expect(new Set(brands.map((r) => r.id)).size).toBe(
    first.brands.pagination.totalRows,
  );
  expect(new Set(categories.map((r) => r.id)).size).toBe(
    first.categories.pagination.totalRows,
  );
  expect(
    categories.reduce((s, r) => s.add(r.stockCost!), D(0)).toString(),
  ).toBe(first.stockCost);
  expect(brands.reduce((s, r) => s.add(r.stockCost!), D(0)).toString()).toBe(
    first.stockCost,
  );
  const byName = (
    await read({
      currency: "UAH",
      categorySort: "name",
      categoryDirection: "asc",
    })
  ).stockWorkspace!.byCurrency[0].categories.rows;
  expect(byName.map((r) => r.name)).toEqual(
    [...byName.map((r) => r.name)].sort(),
  );
  const outOfBounds = (await read({ currency: "UAH", brandPage: "10000" }))
    .stockWorkspace!.byCurrency[0];
  expect(outOfBounds.brands.rows).toEqual([]);
  expect(outOfBounds.brands.pagination.totalRows).toBe(
    first.brands.pagination.totalRows,
  );
});
it("keeps all-channel inventory and currency amounts unchanged by sales channel", async () => {
  const one = await read({ channelId: "1" }),
    two = await read({ channelId: "2" });
  expect(one.stockWorkspace).toEqual(two.stockWorkspace);
  expect(one.stockWorkspace!.byCurrency.map((b) => b.currency)).toEqual([
    "UAH",
    "USD",
  ]);
  expect(
    one.stockWorkspace!.byCurrency.find((b) => b.currency === "USD")!.stockCost,
  ).toBe("16");
});
it.each(
  (["uk", "en"] as const).flatMap((lang) =>
    (["SHEETS_IMPORT", "ORDER_WATERMARK"] as const).map((basis) => ({ lang, basis })),
  ),
)(
  "renders K1–K4 and provider-neutral history copy ($lang, $basis)",
  async ({ lang, basis }) => {
    const data = await read({
        currency: "UAH",
        groupBy: "sku",
        brandId: "brand-a",
      }),
      html = renderToStaticMarkup(
        createElement(StockContent, {
          data: { ...data, freshness: { ...data.freshness, freshnessBasis: basis } },
          lang,
          query:
            "channelId=1&period=month&dateFrom=2026-09-01&dateTo=2026-09-30&brandId=brand-a&groupBy=sku",
        }),
      );
    for (const key of ["K1", "K2", "K3", "K4"])
      expect(html).toContain(key + " ·");
    expect(html).toContain(
      lang === "uk"
        ? "Історичний графік поки недоступний"
        : "Historical chart is not available yet",
    );
    const history = html.split("K2 ·")[1].split("K3 ·")[0];
    expect(history).not.toContain("SalesDrive");
    expect(history).not.toMatch(/через місяць|after one month|from connection day/);
    expect(history).toContain(lang === "uk"
      ? "Для історії потрібні підтверджені спостереження з датою"
      : "History requires verified dated observations");
    expect(history).not.toContain("<svg");
    expect(html).toContain("snapshotId=" + id);
    expect(html).toContain("channelId=1");
    expect(html).toContain("skuId=sku-a");
    expect(html).toContain("/repricing?");
    expect(html).toContain("/reordering?");
    expect(html).toContain("mode=brand");
    expect(html).toContain('role="img"');
    expect(html).not.toMatch(/NaN|Infinity/);
  },
);
it("preserves unknown cost and refuses a fabricated complete ring or zero-valued cell", async () => {
  try {
    await fixture.pg.exec(
      `UPDATE "InventorySnapshot" SET "costPrice"=NULL WHERE "skuId"='sku-a' AND "snapshotDate"='2026-10-25'`,
    );
    const fresh = await createScreenSnapshot("a", screenSelection, fixture.db),
      data = await read({ snapshotId: fresh.snapshotId, currency: "UAH" }),
      block = data.stockWorkspace!.byCurrency[0];
    expect(block.ringCost).toBeNull();
    expect(block.stockCost).toBeNull();
    expect(
      block.statuses.find((s) => s.status === "DEAD")!.ringShare,
    ).toBeNull();
    const html = renderToStaticMarkup(
      createElement(StockContent, { data, lang: "en", query: "" }),
    );
    expect(html).toContain('class="sr-only"> Incomplete data');
  } finally {
    await fixture.pg.exec(
      `UPDATE "InventorySnapshot" SET "costPrice"=10 WHERE "skuId"='sku-a' AND "snapshotDate"='2026-10-25'`,
    );
  }
});
it("never draws a fabricated history curve even when many daily observations exist", async () => {
  const data = await read(),
    html = renderToStaticMarkup(
      createElement(StockContent, { data, lang: "en", query: "" }),
    );
  const k2 = html.split("K2 ·")[1].split("K3 ·")[0];
  expect(k2).not.toContain("<svg");
  expect(data.stockWorkspace!.history).toEqual({ state: "MVP_PLACEHOLDER" });
});
it("reads a published Stock workspace immutably after live metadata/settings changes", async () => {
  const before = await read({ currency: "UAH" });
  try {
    await fixture.pg.exec(
      `UPDATE "Brand" SET name='Edited brand',ownership='UNKNOWN' WHERE id='brand-a'`,
    );
    expect((await read({ currency: "UAH" })).stockWorkspace).toEqual(
      before.stockWorkspace,
    );
  } finally {
    await fixture.pg.exec(
      `UPDATE "Brand" SET name='CITIZEN',ownership='OWN' WHERE id='brand-a'`,
    );
  }
});

it("matches the published daily brand summary for single-currency brands", async () => {
  const { readSkuDaily } = await import("@/lib/sku-daily-store"),
    data = await read({ currency: "UAH" });
  const daily = await readSkuDaily(
    "a",
    data.context.calculationIds.stock,
    { page: 1, pageSize: 100, q: "", sort: "sku", direction: "asc" },
    fixture.db,
  );
  for (const name of ["CITIZEN", "CHPO", "ACTIVE"]) {
    const row = data.stockWorkspace!.byCurrency[0].brands.rows.find(
        (r) => r.name === name,
      )!,
      saved = daily.brands.find((r) => r.brandName === name)!;
    expect(row.signal).toBe(saved.signal);
    expect(
      D(row.weeksOnHand ?? 0)
        .sub(saved.weeksOnHand ?? 0)
        .abs()
        .lt("0.000000000000001"),
    ).toBe(true);
    expect(row.sellThroughRatio).toBe(saved.sellThroughRatio);
    expect(row.firstReceiptDate).toBe(saved.firstReceiptDate);
  }
});
it("keeps a service-only scope outside physical valuation and all percentage denominators", async () => {
  const data = await read({ skuId: "sku-service" }),
    block = data.stockWorkspace!.byCurrency[0];
  expect(block.ringCost).toBe("0");
  expect(block.ringSkuCount).toBe(0);
  expect(block.brands.rows).toEqual([]);
  expect(
    block.statuses.every(
      (r) => r.ringShare === null && r.overviewShare === null,
    ),
  ).toBe(true);
  expect(
    renderToStaticMarkup(
      createElement(StockContent, { data, lang: "en", query: "" }),
    ),
  ).not.toMatch(/NaN|Infinity/);
});
it("keeps unverified product kinds outside the ring and discloses an unknown full valuation", async () => {
  try {
    await fixture.pg.exec(
      `UPDATE "Sku" SET "productKind"='UNKNOWN' WHERE id='sku-unassigned'`,
    );
    const fresh = await createScreenSnapshot("a", screenSelection, fixture.db),
      data = await read({ snapshotId: fresh.snapshotId, currency: "UAH" }),
      block = data.stockWorkspace!.byCurrency[0],
      errors = block.statuses.find((s) => s.status === "DATA_ERROR")!;
    expect(errors.inRing).toBe(false);
    expect(errors.stockCost).toBeNull();
    expect(errors.physicalSkuCount).toBe(0);
    expect(block.stockCost).toBeNull();
    expect(block.ringCost).not.toBeNull();
    expect(block.statuses.every((s) => s.overviewShare === null)).toBe(true);
  } finally {
    await fixture.pg.exec(
      `UPDATE "Sku" SET "productKind"='MERCHANDISE' WHERE id='sku-unassigned'`,
    );
  }
});
