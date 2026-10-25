import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: Record<string, unknown>) =>
    createElement("a", props, children as string),
}));
const m = vi.hoisted(() => ({ mode: "none", error: null as unknown }));
vi.mock("@/lib/sales-report", async (original) => {
  const real = await original<typeof import("@/lib/sales-report")>();
  return {
    ...real,
    getSalesReportInSnapshot: async (
      ...args: Parameters<typeof real.getSalesReportInSnapshot>
    ) => {
      const [tenant, period, tx, capture] = args;
      const trend = period.from === "2026-01-01";
      if (!trend && m.mode === "primary-limit")
        throw new real.SalesReportError("SALES_INPUT_LIMIT", 422);
      if (trend && m.mode === "limit")
        throw new real.SalesReportError("SALES_INPUT_LIMIT", 422);
      if (trend && m.mode === "error") throw m.error;
      const report = await real.getSalesReportInSnapshot(
        tenant,
        period,
        tx,
        (facts, context) => {
          // Each individual input remains within its own bound; only the union exceeds it.
          const selected =
            trend && m.mode === "merged-limit"
              ? Array.from({ length: 100000 }, (_, i) => ({
                  ...facts[0],
                  id: `trend-${i}`,
                  date: "2026-01-02",
                  paidDate: "2026-01-02",
                }))
              : facts;
          capture?.(selected, context);
        },
      );
      return trend && m.mode === "mismatch"
        ? {
            ...report,
            provenance: { ...report.provenance, sourceId: "another-source" },
          }
        : report;
    },
  };
});
import { createScreenDb, screenSelection } from "../helpers/screen-db";
import {
  createScreenSnapshot,
  type ScreenSnapshot,
} from "@/lib/merchandising-snapshot";
import { SalesReportError } from "@/lib/sales-report";
import { getMerchandisingScreen } from "@/lib/merchandising-screen";
import { parseScreenQuery } from "@/lib/merchandising-screen-query";
import OverviewContent from "@/components/overview/OverviewContent";
let fixture: Awaited<ReturnType<typeof createScreenDb>>,
  baseline: ScreenSnapshot;
beforeAll(async () => {
  fixture = await createScreenDb();
  baseline = await createScreenSnapshot("a", screenSelection, fixture.db);
}, 30000);
afterEach(() => {
  m.mode = "none";
  m.error = null;
});
afterAll(async () => fixture?.pg.close());
const read = (id: string) =>
  getMerchandisingScreen(
    "a",
    "overview",
    parseScreenQuery(
      new URLSearchParams({ snapshotId: id, currency: "UAH" }),
      "overview",
    ),
    fixture.db,
    screenSelection.now,
  );
async function counts() {
  return (
    await fixture.pg.query(
      `SELECT (SELECT count(*) FROM "MerchandisingConfig")::int configs, (SELECT count(*) FROM "ReportCalculationRun")::int reports, (SELECT count(*) FROM "SkuDaily")::int daily`,
    )
  ).rows;
}
describe("optional Overview history must not block valid period metrics", () => {
  it.each(["limit", "merged-limit"])(
    "publishes and reuses main-period facts after %s",
    async (mode) => {
      m.mode = mode;
      const snapshot = await createScreenSnapshot(
        "a",
        screenSelection,
        fixture.db,
      );
      expect(snapshot.trend).toBeUndefined();
      expect(snapshot.trendUnavailableReason).toBe("INPUT_LIMIT");
      expect(snapshot.sales.calculationId).toBe(baseline.sales.calculationId);
      expect(snapshot.stock.calculationId).toBe(baseline.stock.calculationId);
      expect(
        (await createScreenSnapshot("a", screenSelection, fixture.db))
          .snapshotId,
      ).toBe(snapshot.snapshotId);
      const rows = (
        await fixture.pg.query<{ n: number; extra: number }>(
          `SELECT count(*)::int n,count(*) FILTER(WHERE NOT "inCurrent" AND NOT "inPriorYear")::int extra FROM "MerchandisingScreenFact" WHERE "snapshotId"=$1`,
          [snapshot.snapshotId],
        )
      ).rows[0];
      expect(rows.n).toBeGreaterThan(0);
      expect(rows.n).toBeLessThan(100000);
      expect(rows.extra).toBe(0);
      const data = await read(snapshot.snapshotId),
        original = await read(baseline.snapshotId);
      expect(data.sales!.summary).toEqual(original.sales!.summary);
      expect(data.stock!.summary).toEqual(original.stock!.summary);
      expect(data.overview!.supportingDataAvailable).toBe(false);
      expect(data.overview!.byCurrency[0].trend).toBeNull();
      for (const lang of ["uk", "en"] as const) {
        const html = renderToStaticMarkup(
          createElement(OverviewContent, {
            data,
            lang,
            query: "currency=UAH",
            monobrand: false,
          }),
        );
        expect(html).toContain(
          lang === "en"
            ? "Annual chart unavailable because the history is too large"
            : "Річний графік недоступний через обсяг історії",
        );
        expect(html).not.toContain(
          lang === "en" ? "older snapshot" : "старому знімку",
        );
      }
    },
    15000,
  );
  it("still rejects an oversized main report", async () => {
    m.mode = "primary-limit";
    await expect(
      createScreenSnapshot("a", screenSelection, fixture.db),
    ).rejects.toMatchObject({ code: "SALES_INPUT_LIMIT", status: 422 });
  });
  it.each([
    new SalesReportError("SALES_HISTORY_LIMIT", 422),
    new Error("database failure"),
    { code: "SALES_INPUT_LIMIT", status: 422 },
  ])(
    "rethrows unrelated or untyped errors and rolls back publications: %j",
    async (error) => {
      const before = await counts();
      m.mode = "error";
      m.error = error;
      await expect(
        createScreenSnapshot(
          "a",
          { ...screenSelection, dateTo: "2026-09-29" },
          fixture.db,
        ),
      ).rejects.toBe(error);
      expect(await counts()).toEqual(before);
    },
  );
  it("keeps trend source provenance checks when trend data is available", async () => {
    m.mode = "mismatch";
    await expect(
      createScreenSnapshot("a", screenSelection, fixture.db),
    ).rejects.toMatchObject({ code: "INCONSISTENT_SCREEN_INPUTS" });
  });
});
