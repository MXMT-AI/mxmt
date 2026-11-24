import { isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import DashboardPage from "@/components/dashboard/dashboard-page/dashboard-page";
import { DashboardSkuPanel } from "@/components/dashboard/dashboard-sku-panel/dashboard-sku-panel";
import { DashboardSalesPanel } from "@/components/dashboard/dashboard-sales-panel/dashboard-sales-panel";
import { DashboardSetupCard } from "@/components/dashboard/dashboard-setup-card/dashboard-setup-card";
import { MetricTile } from "@/components/ui/metric-tile/metric-tile";
import type { ClassifiedSku } from "@/lib/analyst-types";

const fixture = vi.hoisted(() => ({
  classify: vi.fn(),
  dailySales: vi.fn(),
  catalogCount: vi.fn(),
  headers: vi.fn(),
  locale: vi.fn(),
  publication: vi.fn(),
  redirect: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: fixture.headers }));
vi.mock("next-intl/server", () => ({ getLocale: fixture.locale }));
vi.mock("@/i18n/navigation", () => ({ redirect: fixture.redirect }));
vi.mock("@/lib/analyst-classification", () => ({ loadAnalystClassification: fixture.classify }));
vi.mock("@/lib/merchandising-publication", () => ({ readWorkspacePublication: fixture.publication }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    googleDriveSync: { findFirst: fixture.sync },
    catalogItem: { count: fixture.catalogCount },
    salesRecord: { groupBy: fixture.dailySales },
  },
}));

function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}

beforeEach(() => {
  vi.resetAllMocks();
  fixture.headers.mockResolvedValue(new Headers({ "x-tenant-id": "store" }));
  fixture.locale.mockResolvedValue("en");
  fixture.publication.mockResolvedValue(null);
  fixture.redirect.mockImplementation(() => { throw new Error("REDIRECT"); });
  fixture.sync.mockResolvedValue(null);
  fixture.catalogCount.mockResolvedValue(0);
  fixture.dailySales.mockResolvedValue([]);
});

it("opens the modern overview for the published demo without loading the legacy dashboard", async () => {
  fixture.publication.mockResolvedValue({ agentSource: { importRunId: "archived-agents" } });
  await expect(DashboardPage()).rejects.toThrow("REDIRECT");
  expect(fixture.redirect).toHaveBeenCalledWith({ href: "/overview", locale: "en" });
  expect(fixture.classify).not.toHaveBeenCalled();
});

it.each(["uk", "en"])("redirects missing tenant context before any report query in %s", async locale => {
  fixture.headers.mockResolvedValue(new Headers());
  fixture.locale.mockResolvedValue(locale);
  await expect(DashboardPage()).rejects.toThrow("REDIRECT");
  expect(fixture.redirect).toHaveBeenCalledWith({ href: "/login", locale });
  for (const query of [fixture.classify, fixture.sync, fixture.catalogCount, fixture.dailySales]) {
    expect(query).not.toHaveBeenCalled();
  }
});

it("counts all alerts while showing four SKUs per panel with the existing sorting", async () => {
  const skus = Array.from({ length: 12 }, (_, index) => ({
    id: String(index), sku: String(index), name: "Fixture", brand: null,
    flag: index < 6 ? "stockout" : "hit",
    daysOfStock: 12 - index, sold7: index,
  })) as ClassifiedSku[];
  fixture.classify.mockResolvedValue({
    skus,
    summary: { stockout: 6, hit: 6 },
    businessModel: "RETAIL",
    hasOnboarding: true,
    catalogSkuCount: 15,
  });
  const tree = nodes(await DashboardPage());
  const metrics = tree.filter((node) => node.type === MetricTile);
  expect(metrics[0].props.value).toBe("15");
  expect(metrics[1].props.value).toBe("12");
  const panels = tree.filter((node) => node.type === DashboardSkuPanel);
  expect(panels.map((node) => node.props.items.map((sku: ClassifiedSku) => sku.id))).toEqual([
    ["5", "4", "3", "2"],
    ["11", "10", "9", "8"],
  ]);
  expect(panels.map((node) => node.props.total)).toEqual([6, 6]);
  expect(fixture.classify).toHaveBeenCalledWith("store");
});

it("keeps catalog-only SKUs in the total and calculates the 30-day and weekly sales", async () => {
  fixture.classify.mockResolvedValue({
    skus: [], summary: { stockout: 0, hit: 0 },
    businessModel: null, hasOnboarding: false, catalogSkuCount: 7,
  });
  const dayAgo = (days: number) => new Date(Date.now() - days * 86400000);
  fixture.dailySales.mockResolvedValue([
    { date: dayAgo(2), _sum: { qtySold: 15 } },
    { date: dayAgo(9), _sum: { qtySold: 10 } },
    { date: dayAgo(20), _sum: { qtySold: 5 } },
  ]);
  const tree = nodes(await DashboardPage());
  expect(tree.find((node) => node.type === MetricTile)?.props.value).toBe("7");
  const sales = tree.find((node) => node.type === DashboardSalesPanel);
  expect(sales?.props.total).toBe(30);
  expect(sales?.props.weekChange).toBe(50);
  expect(tree.filter((node) => node.type === DashboardSetupCard).map((node) => node.props.href)).toEqual(["/settings"]);
});
