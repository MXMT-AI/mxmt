import { expect, it } from "vitest";
import { buildScreenSelection, buildScreenReadParams, readScreenControls } from "@/lib/client/merchandising-screen-request";
import { MVP_SCREENS } from "@/lib/merchandising-navigation";
const filters = { period: "month" as const, dateFrom: "2026-09-01", dateTo: "2026-09-30", channelId: "2" };
const params = new URLSearchParams("asOf=2026-10-01&brandId=b&categoryId=c&skuId=s&currency=UAH&channelId=2&snapshotId=old&page=9");

it("uses the saved stock date when a bookmarked URL carries an older date", () => {
  const selection = buildScreenSelection({ ...filters, publishedAsOf: "2026-09-30" }, "overview", params, {});
  expect(selection.get("asOf")).toBe("2026-09-30");
});

it("retains explicit empty stock controls for links and omits them by default", () => {
  const query = new URLSearchParams("page=2&direction=&categorySort=DEAD&measure=units");
  expect(readScreenControls("stock", query)).toEqual({ page: "2", categorySort: "DEAD" });
  expect(readScreenControls("stock", query, { includeEmpty: true })).toEqual({
    page: "2", direction: "", categorySort: "DEAD",
  });
});
it.each(MVP_SCREENS)("preserves selection rules and control precedence for %s", screen => {
  const selection = buildScreenSelection(filters, screen, params, { page: "3", currency: "EUR" });
  expect(selection.get("dateFrom")).toBe(filters.dateFrom);
  expect(selection.get("dateTo")).toBe(filters.dateTo);
  expect(selection.get("asOf")).toBe("2026-10-01");
  expect(selection.get("currency")).toBe("EUR");
  expect(selection.get("page")).toBe("3");
  expect(selection.has("snapshotId")).toBe(false);
  const scenario = screen === "repricing" || screen === "reordering";
  expect(selection.get("brandId")).toBe(scenario ? null : "b");
  expect(selection.get("channelId")).toBe(scenario ? null : "2");
});
it.each(MVP_SCREENS)("forwards only the allowed report parameters for %s", screen => {
  const source = new URLSearchParams("brandId=b&channelId=2&groupBy=sku&metric=revenue&measure=units&others=1&page=3&channelPage=4&classification=HIT&ownership=OWN&supplierId=x&sort=stockCost&direction=desc&categoryPage=2&brandPage=3&categorySort=name&categoryDirection=asc&unexpected=secret&asOf=2026-10-01");
  const read = buildScreenReadParams(screen, source, "pinned");
  expect(read.get("snapshotId")).toBe("pinned");
  expect(read.get("brandId")).toBe("b");
  expect(read.get("channelId")).toBe("2");
  expect(read.has("unexpected")).toBe(false);
  expect(read.has("asOf")).toBe(false);
  const detail = screen === "sales" || screen === "stock";
  expect(read.get("page")).toBe(detail ? "3" : null);
  expect(read.get("groupBy")).toBe(detail ? "sku" : null);
  expect(read.get("channelPage")).toBe(screen === "sales" ? "4" : null);
  expect(read.get("metric")).toBe(screen === "sales" ? "revenue" : null);
  expect(read.get("supplierId")).toBe(screen === "stock" ? "x" : null);
  expect(read.get("categoryDirection")).toBe(screen === "stock" ? "asc" : null);
});
