import { describe, it, expect } from "vitest";
import {
  applyMerchandisingFilters,
  readMerchandisingFilters,
  presetPeriod,
  merchandisingHref,
  merchandisingGroup,
} from "@/lib/merchandising-navigation";
import { navigationFeatures } from "@/lib/navigation-features";
const now = new Date("2026-10-25T10:00:00Z");
const read = (s = "", clock = now) =>
  readMerchandisingFilters(new URLSearchParams(s), clock);
describe("URL-owned MVP navigation", () => {
  it("retains an explicit partial preset when reloaded on a later day", () => {
    const params =
      "period=month&dateFrom=2026-10-01&dateTo=2026-10-24&channelId=2";
    expect(read(params, new Date("2026-10-26T10:00:00Z"))).toMatchObject({
      period: "month",
      dateFrom: "2026-10-01",
      dateTo: "2026-10-24",
      channelId: "2",
    });
  });
  it("uses approved Kyiv D15 defaults on either side of day seven", () => {
    expect(read("", new Date("2026-10-06T20:00:00Z"))).toMatchObject({
      period: "month",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });
    expect(read("", new Date("2026-10-06T21:30:00Z"))).toMatchObject({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-06",
    });
  });
  it("expands month/quarter/year using completed calendar days", () => {
    expect(presetPeriod("month", "2026-09-15", now)).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(presetPeriod("quarter", "2026-08-15", now)).toMatchObject({
      from: "2026-07-01",
      to: "2026-09-30",
    });
    expect(presetPeriod("year", "2026-01-01", now)).toMatchObject({
      from: "2026-01-01",
      to: "2026-10-24",
    });
    expect(presetPeriod("year", "2024-07-01", now).days).toBe(366);
  });
  it("restores an explicit custom period and a safely encoded channel across screens", () => {
    const params = new URLSearchParams({
      period: "custom",
      dateFrom: "2026-08-10",
      dateTo: "2026-09-15",
      channelId: "store & web/1",
      snapshotId: "pinned",
      brandId: "brand-a",
      categoryId: "cat-a",
      page: "5",
      sort: "revenue",
    });
    for (const route of [
      "/overview",
      "/sales",
      "/stock",
      "/repricing",
      "/reordering",
      "/settings",
    ]) {
      const url = new URL(merchandisingHref(route, params), "https://app.test");
      expect(read(url.search)).toEqual(readMerchandisingFilters(params, now));
      expect(url.searchParams.get("snapshotId")).toBe("pinned");
      expect(url.searchParams.get("brandId")).toBe("brand-a");
      expect(url.searchParams.has("page")).toBe(false);
      expect(url.searchParams.has("sort")).toBe(false);
    }
  });
  it("preserves stock snapshot on channel changes and invalidates it for date changes", () => {
    const params = new URLSearchParams(
      "period=month&dateFrom=2026-09-01&dateTo=2026-09-30&snapshotId=pinned&page=8&brandId=brand-a",
    );
    const channel = applyMerchandisingFilters(
      params,
      { ...readMerchandisingFilters(params, now), channelId: "2" },
      now,
    );
    expect(channel.get("snapshotId")).toBe("pinned");
    expect(channel.has("page")).toBe(false);
    const changed = applyMerchandisingFilters(
      channel,
      {
        ...readMerchandisingFilters(channel, now),
        period: "custom",
        dateFrom: "2026-08-01",
      },
      now,
    );
    expect(changed.has("snapshotId")).toBe(false);
    expect(changed.get("brandId")).toBe("brand-a");
    expect(changed.get("channelId")).toBe("2");
  });
  it.each([
    "dateFrom=2026-09-01",
    "dateFrom=&dateTo=",
    "dateFrom=2026-02-31&dateTo=2026-03-01",
    "dateFrom=2026-09-30&dateTo=2026-09-01",
    "dateFrom=2026-09-01&dateTo=2026-12-01",
    "dateFrom=2024-01-01&dateTo=2026-01-01",
    "period=week",
    "period=month&period=year",
    "channelId=x&channelId=y",
    "period=quarter&dateFrom=2026-08-01&dateTo=2026-09-30",
  ])(
    "rejects invalid deep links instead of silently changing selection: %s",
    (s) => expect(() => read(s)).toThrow(),
  );
  it("hides the brand grouping for monobrand profiles, including old deep links", () => {
    expect(merchandisingGroup(new URLSearchParams("groupBy=brand"), true)).toBe(
      "category",
    );
    expect(merchandisingGroup(new URLSearchParams("groupBy=sku"), true)).toBe(
      "sku",
    );
    expect(merchandisingGroup(new URLSearchParams(), false)).toBe("brand");
  });
  it("keeps legacy menu visibility separate from MVP routes", () => {
    expect(navigationFeatures({})).toEqual({
      merchandising: true,
      legacy: true,
    });
    expect(navigationFeatures({ LEGACY_NAVIGATION_ENABLED: "false" })).toEqual({
      merchandising: true,
      legacy: false,
    });
  });
});
