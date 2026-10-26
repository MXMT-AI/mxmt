import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: Record<string, unknown>) =>
    createElement("a", props, children as string),
}));
import SalesContent from "@/components/sales/SalesContent";
import { createScreenDb, screenSelection } from "../helpers/screen-db";
import {
  readScreenSnapshot,
  createScreenSnapshot,
} from "@/lib/merchandising-snapshot";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import { parseScreenQuery } from "@/lib/merchandising-screen-query";
import { financialDecimal as D } from "@/lib/merchandising-policy";
import {
  readClientSettings,
  saveMerchandisingSettings,
} from "@/lib/merchandising-settings-store";
let fixture: Awaited<ReturnType<typeof createScreenDb>>, id: string;
async function cloneLine(
  id: string,
  sku: string,
  revenue: number,
  date = "2026-09-15",
  channel: string | null = "1",
  quantity = 1,
) {
  await fixture.pg.query(
    `INSERT INTO "OrderLine" SELECT (jsonb_populate_record(NULL::"OrderLine",to_jsonb(l)||$1::jsonb)).* FROM "OrderLine" l WHERE "externalOrderId"='one' AND "skuId"='sku-a'`,
    [
      JSON.stringify({
        id,
        externalOrderId: id,
        externalLineId: sku,
        sourceRecordKey: id,
        skuId: sku,
        externalProductId: sku,
        paidAt: date + "T12:00:00+03:00",
        orderedAt: date + "T12:00:00+03:00",
        channelId: channel,
        quantity,
        signedQuantity: quantity,
        netAmount: revenue,
        signedRevenue: revenue,
        costAmount: revenue * 0.5,
        signedCost: revenue * 0.5,
      }),
    ],
  );
}
beforeAll(async () => {
  fixture = await createScreenDb();
  for (let i = 0; i < 15; i++) {
    await fixture.pg.query(
      `INSERT INTO "Brand" (id,"tenantId",name,ownership) VALUES ($1,'a',$2,'OWN');`,
      ["extra-brand-" + i, "Brand " + String(i).padStart(2, "0")],
    );
    await fixture.pg.query(
      `INSERT INTO "Category" (id,"tenantId",key,name,"updatedAt") VALUES ($1,'a',$1,$2,now()) ON CONFLICT DO NOTHING`,
      ["extra-cat-" + (i % 6), "Category " + (i % 6)],
    );
    await fixture.pg.query(
      `INSERT INTO "Sku" (id,"tenantId",sku,name,category,"brandId","categoryId","productKind") VALUES ($1,'a',$1,$2,$4,$3,$4,'MERCHANDISE')`,
      [
        "extra-sku-" + i,
        "Product " + i,
        "extra-brand-" + i,
        "extra-cat-" + (i % 6),
      ],
    );
    await cloneLine("extra-current-" + i, "extra-sku-" + i, (i + 1) * 10);
    await cloneLine(
      "extra-ly-" + i,
      "extra-sku-" + i,
      200 - i * 12,
      "2025-09-15",
    );
  }
  await cloneLine("january", "sku-a", 5, "2026-01-20");
  for (let i = 0; i < 27; i++)
    await cloneLine(
      "channel-" + i,
      "sku-a",
      i + 1,
      "2026-09-16",
      "channel-" + i,
    );
  for (let i = 0; i < 309; i++)
    await cloneLine(
      "count-" + i,
      "extra-sku-14",
      i < 3 ? 40 : 20,
      "2026-09-20",
      "count",
      i < 3 ? 2 : 1,
    );
  id = (await createScreenSnapshot("a", screenSelection, fixture.db))
    .snapshotId;
}, 30000);
afterAll(async () => fixture?.pg.close());
async function read(values: Record<string, string> = {}) {
  return getMerchandisingScreen(
    "a",
    "sales",
    parseScreenQuery(
      new URLSearchParams({ snapshotId: id, groupBy: "brand", ...values }),
      "sales",
    ),
    fixture.db,
    screenSelection.now,
  );
}
describe("Sales S1–S4 immutable workspace", () => {
  it("reconciles month, channel and category totals to the selected-period O2 metric", async () => {
    const data = await read({ currency: "UAH" }),
      block = data.workspace!.byCurrency[0],
      sales = data.sales!.summary[0];
    expect(
      block.matrix.total!.cells.find((c) => c.month === "2026-09")!.value,
    ).toBe(sales.current.revenue);
    expect(
      D(block.matrix.total!.total.value!)
        .sub(sales.current.revenue!)
        .toString(),
    ).toBe("5");
    expect(block.categories.find((r) => r.kind === "TOTAL")!.cells).toEqual(
      block.matrix.total!.cells.map((c) => ({ ...c, alpha: null })),
    );
    const categoryGroups = block.categories.filter((r) => r.kind !== "TOTAL");
    expect(categoryGroups.filter((r) => r.kind === "GROUP")).toHaveLength(4);
    expect(categoryGroups.filter((r) => r.kind === "OTHERS")).toHaveLength(1);
    for (let i = 0; i < 9; i++)
      expect(
        categoryGroups
          .reduce((s, r) => s.add(r.cells[i].value!), D(0))
          .toString(),
      ).toBe(block.matrix.total!.cells[i].value);
    expect(block.channels.rows[0].id).toBe("count");
    expect(block.channels.pagination.totalRows).toBe(31);
    const page2 = (await read({ currency: "UAH", channelPage: "2" })).workspace!
      .byCurrency[0];
    expect(
      [...block.channels.rows, ...page2.channels.rows]
        .reduce((s, r) => s.add(r.total.value!), D(0))
        .toString(),
    ).toBe(sales.current.revenue);
    expect(
      [...block.channels.rows, ...page2.channels.rows]
        .reduce((s, r) => s.add(r.share!), D(0))
        .sub(1)
        .abs()
        .lt("0.000000000000001"),
    ).toBe(true);
  });
  it("keeps exactly top 11 plus Others and exposes every remaining group without changing totals", async () => {
    const block = (await read({ currency: "UAH", others: "1", pageSize: "3" }))
      .workspace!.byCurrency[0];
    const groups = block.matrix.rows.filter((r) => r.kind === "GROUP"),
      other = block.matrix.rows.find((r) => r.kind === "OTHERS")!;
    expect(groups).toHaveLength(11);
    expect(block.matrix.rows.at(-1)!.kind).toBe("OTHERS");
    expect(other.groupCount).toBe(7);
    expect(
      groups
        .reduce((s, r) => s.add(r.total.value!), D(other.total.value!))
        .toString(),
    ).toBe(block.matrix.total!.total.value);
    const remaining = [...block.matrix.otherRows];
    for (let page = 2; page <= block.matrix.pagination.totalPages; page++)
      remaining.push(
        ...(
          await read({
            currency: "UAH",
            others: "1",
            pageSize: "3",
            page: String(page),
          })
        ).workspace!.byCurrency[0].matrix.otherRows,
      );
    expect(new Set(remaining.map((r) => r.id)).size).toBe(7);
    expect(
      remaining.reduce((s, r) => s.add(r.total.value!), D(0)).toString(),
    ).toBe(other.total.value);
    for (let month = 0; month < 9; month++)
      expect(
        groups
          .reduce(
            (s, r) => s.add(r.cells[month].value!),
            D(other.cells[month].value!),
          )
          .toString(),
      ).toBe(block.matrix.total!.cells[month].value);
    for (const r of [...groups, other, block.matrix.total!])
      for (const c of [...r.cells, r.total])
        expect(c.alpha).toBeGreaterThanOrEqual(0.04);
  });
  it("keeps 309 sale orders distinct from 312 merchandise units and disables financial cells in units mode", async () => {
    const data = await read({
      currency: "UAH",
      skuId: "extra-sku-14",
      channelId: "count",
      measure: "units",
      metric: "gmPct",
    });
    const model = data.workspace!,
      block = model.byCurrency[0];
    expect(data.sales!.summary[0].current.orderCount).toBe(309);
    expect(data.sales!.summary[0].current.units).toBe("312");
    expect(model.metric).toBe("units");
    expect(block.matrix.total!.total.value).toBe("312");
    expect(block.categories.find((r) => r.kind === "TOTAL")!.total.value).toBe(
      "312",
    );
    expect(block.channels.rows[0].total.value).toBe("6240");
    const html = renderToStaticMarkup(
      createElement(SalesContent, {
        data,
        lang: "en",
        query: "measure=units&channelId=count",
      }),
    );
    expect(html).toContain("309");
    expect(html).toContain("312");
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
  it("uses financial coverage and threshold colors without changing the denominator", async () => {
    const block = (await read({ currency: "UAH", metric: "gmPct" })).workspace!
      .byCurrency[0];
    const own = block.matrix.rows.find((r) => r.id === "brand-a")!,
      consignment = block.matrix.rows.find((r) => r.id === "brand-b")!;
    expect(own.total.value).toBe("0.5");
    expect(own.total.tone).toBe("GREEN");
    expect(consignment.total.value).toBe("0.2");
    expect(consignment.total.tone).toBe("RED");
    expect(block.matrix.total!.total.partial).toBe(true);
  });
  it("returns six declines, three increases, exact full Total and strict brand-month LY notes", async () => {
    const data = await read({ currency: "UAH" }),
      c = data.workspace!.byCurrency[0].comparison;
    expect(c.rows.filter((r) => r.tone === "RED")).toHaveLength(6);
    expect(c.rows.filter((r) => r.tone === "GREEN")).toHaveLength(3);
    expect(c.rows[0].delta).toBe("-190");
    expect(c.rows[0].oneOffLy).toBe(true);
    expect(c.total!.current).toBe(data.sales!.summary[0].current.revenue);
    expect(c.total!.delta).toBe(data.sales!.summary[0].revenueDelta);
    const only = (
      await read({ currency: "UAH", skuId: "sku-a", channelId: "2" })
    ).workspace!.byCurrency[0];
    expect(only.comparison.total!.current).toBe("20");
    expect(only.comparison.total!.ly).toBe("20");
    expect(only.comparison.rows).toEqual([]);
  });
  it.each(["uk", "en"] as const)(
    "renders all four sections and pinned filter-aware drills in %s",
    async (lang) => {
      const data = await read({ currency: "UAH" }),
        html = renderToStaticMarkup(
          createElement(SalesContent, {
            data,
            lang,
            query:
              "period=month&dateFrom=2026-09-01&dateTo=2026-09-30&channelId=1",
          }),
        );
      for (const n of ["S1", "S2", "S3", "S4"])
        expect(html).toContain(n + " ·");
      expect(html).toContain("snapshotId=" + id);
      expect(html).toContain("channelId=1");
      expect(html).toContain("dateFrom=2026-09-01");
      expect(html).toContain("groupBy=sku");
      expect(html).toContain('role="img"');
      expect(html).not.toMatch(/NaN|Infinity/);
    },
  );
  it("preserves no-history states and avoids invented LY zeros", async () => {
    const previous = (
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
        ),
        data = await read({ snapshotId: fresh.snapshotId, currency: "UAH" }),
        c = data.workspace!.byCurrency[0].comparison;
      expect(c.available).toBe(false);
      expect(c.total!.ly).toBeNull();
      expect(c.total!.delta).toBeNull();
      expect(c.rows).toEqual([]);
      expect(
        renderToStaticMarkup(
          createElement(SalesContent, { data, lang: "en", query: "" }),
        ),
      ).toContain("Insufficient LY history");
    } finally {
      await fixture.pg.query(
        `UPDATE "ConnectorSyncJob" SET checkpoint=$1 WHERE id='orders-job'`,
        [JSON.stringify(previous)],
      );
    }
  });
  it("uses category/SKU in monobrand snapshots even for an old brand deep link", async () => {
    const client = await readClientSettings("a", fixture.db);
    await saveMerchandisingSettings(
      "a",
      "owner",
      "client",
      null,
      client.revision,
      { ...client.values, profileMode: "MONOBRAND", monoBrandId: "brand-a" },
      fixture.db,
    );
    try {
      const fresh = await createScreenSnapshot(
          "a",
          screenSelection,
          fixture.db,
        ),
        data = await read({ snapshotId: fresh.snapshotId, currency: "UAH" });
      expect(data.workspace!.groupBy).toBe("category");
      expect(data.workspace!.monobrand).toBe(true);
      expect(
        renderToStaticMarkup(
          createElement(SalesContent, {
            data,
            lang: "en",
            query: "groupBy=brand",
          }),
        ),
      ).not.toContain(">Brands</a>");
    } finally {
      const current = await readClientSettings("a", fixture.db);
      await saveMerchandisingSettings(
        "a",
        "owner",
        "client",
        null,
        current.revision,
        client.values,
        fixture.db,
      );
    }
  });
});

it("keeps a published Sales workspace immutable after source changes", async () => {
  const before = await read({ currency: "UAH" });
  try {
    await fixture.pg.exec(
      `UPDATE "OrderLine" SET "signedRevenue"=50 WHERE id='january'`,
    );
    expect((await read({ currency: "UAH" })).workspace).toEqual(
      before.workspace,
    );
    const fresh = await createScreenSnapshot("a", screenSelection, fixture.db);
    const after = await read({ snapshotId: fresh.snapshotId, currency: "UAH" });
    expect(
      D(after.workspace!.byCurrency[0].matrix.total!.total.value!)
        .sub(before.workspace!.byCurrency[0].matrix.total!.total.value!)
        .toString(),
    ).toBe("45");
  } finally {
    await fixture.pg.exec(
      `UPDATE "OrderLine" SET "signedRevenue"=5 WHERE id='january'`,
    );
  }
});
it("keeps negative returns signed and does not divide a non-positive channel total", async () => {
  const previous = (
    await fixture.pg.query<{ id: string; signedRevenue: string }>(
      `SELECT id,"signedRevenue" FROM "OrderLine" WHERE "externalOrderId"='return'`,
    )
  ).rows[0];
  try {
    await fixture.pg.query(
      `UPDATE "OrderLine" SET "signedRevenue"=-200 WHERE id=$1`,
      [previous.id],
    );
    const fresh = await createScreenSnapshot("a", screenSelection, fixture.db),
      data = await read({
        snapshotId: fresh.snapshotId,
        currency: "UAH",
        skuId: "sku-a",
        channelId: "1",
      }),
      block = data.workspace!.byCurrency[0];
    expect(block.matrix.total!.total.value).toBe("-155");
    expect(block.matrix.total!.cells.at(-1)!.value).toBe("-160");
    expect(block.matrix.total!.total.tone).toBe("RED");
    expect(block.channels.rows[0].share).toBeNull();
    for (const c of block.matrix.total!.cells) {
      expect(c.alpha).toBeGreaterThanOrEqual(0.04);
      expect(c.alpha).toBeLessThanOrEqual(0.38);
    }
    expect(
      renderToStaticMarkup(
        createElement(SalesContent, { data, lang: "en", query: "" }),
      ),
    ).not.toMatch(/NaN|Infinity/);
  } finally {
    await fixture.pg.query(
      `UPDATE "OrderLine" SET "signedRevenue"=$1 WHERE id=$2`,
      [previous.signedRevenue, previous.id],
    );
  }
});
it("shows a known LY zero with an absolute change and an unavailable percentage", async () => {
  const data = await read({ currency: "UAH", skuId: "sku-c" }),
    block = data.workspace!.byCurrency[0];
  expect(block.comparison.total!.ly).toBe("0");
  expect(block.comparison.total!.delta).toBe("10");
  expect(block.comparison.total!.changePct).toBeNull();
  const html = renderToStaticMarkup(
    createElement(SalesContent, { data, lang: "en", query: "" }),
  );
  expect(html).toContain(">+10</span>");
  expect(html).not.toContain("+—");
});

it("retains period data when YTD support or dated legacy facts are unavailable", async () => {
  const { readSalesWorkspace } = await import(
    "@/lib/merchandising-sales-workspace"
  );
  const data = await read({ currency: "UAH" }),
    snapshot = await readScreenSnapshot("a", id, fixture.db),
    q = parseScreenQuery(
      new URLSearchParams({
        snapshotId: id,
        currency: "UAH",
        groupBy: "brand",
      }),
      "sales",
    );
  const fallback = {
    ...snapshot,
    trend: undefined,
    trendUnavailableReason: "INPUT_LIMIT" as const,
  };
  const model = await readSalesWorkspace(
    "a",
    fallback,
    q,
    fixture.db,
    data.sales!.summary,
  );
  expect(model.yearHistoryAvailable).toBe(false);
  expect(model.oneOffAvailable).toBe(false);
  expect(model.tablePeriod).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  expect(model.byCurrency[0].matrix.total!.total.value).toBe(
    data.sales!.summary[0].current.revenue,
  );
  const legacy = await readSalesWorkspace(
    "a",
    { ...fallback, modelVersion: 1 },
    q,
    fixture.db,
    data.sales!.summary,
  );
  expect(legacy.monthlyAvailable).toBe(false);
  expect(legacy.byCurrency[0].matrix.total).toBeNull();
  expect(legacy.byCurrency[0].comparison.total!.current).toBe(
    data.sales!.summary[0].current.revenue,
  );
});

it.each(["uk", "en"] as const)(
  "exposes localized partial-data text in monthly, channel and LY cells (%s)",
  async (lang) => {
    const previous = (
      await fixture.pg.query<{
        id: string;
        signedRevenue: string;
        netAmount: string;
      }>(
        `SELECT id,"signedRevenue","netAmount" FROM "OrderLine" WHERE "skuId"='sku-c'`,
      )
    ).rows[0];
    try {
      await fixture.pg.query(
        `UPDATE "OrderLine" SET "signedRevenue"=NULL,"netAmount"=NULL WHERE id=$1`,
        [previous.id],
      );
      const fresh = await createScreenSnapshot(
          "a",
          screenSelection,
          fixture.db,
        ),
        data = await read({
          snapshotId: fresh.snapshotId,
          currency: "UAH",
          skuId: "sku-c",
        });
      const html = renderToStaticMarkup(
          createElement(SalesContent, { data, lang, query: "" }),
        ),
        label = lang === "uk" ? "Неповні дані" : "Incomplete data";
      for (const section of ["S1", "S2", "S4"]) {
        const content = html
          .split("<h3")
          .find((part) => part.includes(section + " ·"));
        expect(content).toContain(
          '<span aria-hidden="true"> *</span><span class="sr-only"> ' +
            label +
            "</span>",
        );
      }
      expect(html).not.toContain('aria-label="' + label + '"');
    } finally {
      await fixture.pg.query(
        `UPDATE "OrderLine" SET "signedRevenue"=$1,"netAmount"=$2 WHERE id=$3`,
        [previous.signedRevenue, previous.netAmount, previous.id],
      );
    }
  },
);
