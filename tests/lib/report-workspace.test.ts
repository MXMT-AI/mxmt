import { isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import SalesWorkspace from "@/components/sales/sales-workspace/sales-workspace";
import StockWorkspace from "@/components/stock/stock-workspace/stock-workspace";
import OverviewWorkspace from "@/components/overview/overview-workspace/overview-workspace";
import SalesContent from "@/components/sales/sales-content/sales-content";
import StockContent from "@/components/stock/stock-content/stock-content";
import OverviewContent from "@/components/overview/overview-content/overview-content";
import { WorkspaceLoading } from "@/components/merchandising/workspace-loading/workspace-loading";
import ReportingError from "@/components/merchandising/reporting-error/reporting-error";
import ReportReadiness from "@/components/merchandising/report-readiness/report-readiness";
import { ReportWorkspaceFrame } from "@/components/merchandising/report-workspace-frame/report-workspace-frame";
import { salesWorkspaceControls } from "@/components/sales/sales-workspace-controls";
import { stockWorkspaceControls } from "@/components/stock/stock-workspace-controls";
const mocks = vi.hoisted(() => ({ screen: vi.fn(), refresh: vi.fn(), push: vi.fn(), lang: "en", monobrand: true }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: () => [false, vi.fn()] }));
vi.mock("next/navigation", async load => ({ ...await load<typeof import("next/navigation")>(), useSearchParams: () => new URLSearchParams("groupBy=brand&measure=units&page=2&channelPage=3") }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null, useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/language-provider/language-provider", () => ({ useLang: () => ({ lang: mocks.lang }) }));
vi.mock("@/components/merchandising/merchandising-shell/merchandising-shell", () => ({ useMerchandisingFilters: () => ({ channelId: "c" }), useMerchandisingOptions: () => ({ monobrand: mocks.monobrand }), useScenarioExportPermission: () => false }));
vi.mock("@/components/merchandising/use-merchandising-screen", () => ({ useMerchandisingScreen: mocks.screen }));
vi.mock("@/components/sales/sales-content/sales-content", () => ({ default: () => null }));
vi.mock("@/components/stock/stock-content/stock-content", () => ({ default: () => null }));
vi.mock("@/components/overview/overview-content/overview-content", () => ({ default: () => null }));
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
const data = { context: { snapshotId: "s", profileMode: "MONOBRAND" }, readiness: {} };
beforeEach(() => { vi.clearAllMocks(); mocks.lang = "en"; mocks.monobrand = true; mocks.screen.mockReturnValue({ data, busy: false, error: "", refresh: mocks.refresh }); });
for (const [Workspace, Content, name] of [[SalesWorkspace, SalesContent, "sales"], [StockWorkspace, StockContent, "stock"], [OverviewWorkspace, OverviewContent, "overview"]] as const) {
  it.each(["uk", "en"])(`preserves ${name} error/loading/ready states in %s`, lang => {
    mocks.lang = lang;
    const renderWorkspace = () => {
      const workspace = Workspace();
      expect(workspace.type).toBe(ReportWorkspaceFrame);
      return nodes(ReportWorkspaceFrame(workspace.props));
    };
    mocks.screen.mockReturnValue({ data, busy: true, error: "FAILED", refresh: mocks.refresh });
    const error = renderWorkspace();
    expect(error[0].type).toBe(ReportingError);
    expect(error[0].props.onRetry).toBe(mocks.refresh);
    for (const state of [{ data, busy: true }, { data: null, busy: false }]) {
      mocks.screen.mockReturnValue({ ...state, error: "", refresh: mocks.refresh });
      const loading = renderWorkspace();
      expect(loading[0].type).toBe(WorkspaceLoading);
      expect(loading.some(node => node.type === Content)).toBe(false);
      expect(nodes(WorkspaceLoading(loading[0].props as Parameters<typeof WorkspaceLoading>[0]))[0].props.role).toBe("status");
      if (name === "sales") expect(loading[0].props.messageClassName).toBe("mt-4 text-base");
      if (name === "overview") expect(loading[0].props).toMatchObject({ className: "py-6", "aria-live": "polite" });
    }
    mocks.screen.mockReturnValue({ data, busy: false, error: "", refresh: mocks.refresh });
    const ready = renderWorkspace();
    expect(ready.some(node => node.type === ReportReadiness)).toBe(true);
    expect(ready.find(node => node.type === Content)!.props).toMatchObject({ data, lang, onRefresh: mocks.refresh, query: "groupBy=brand&measure=units&page=2&channelPage=3" });
  });
}
it("passes sales-specific controls to its request", () => {
  SalesWorkspace();
  expect(mocks.screen).toHaveBeenCalledWith({ channelId: "c" }, "sales", { groupBy: "category", measure: "units", page: "2", channelPage: "3" });
});
it("copies only nonempty sales controls and preserves invalid drafts for server validation", () => {
  const params = new URLSearchParams("groupBy=brand&metric=invalid&measure=&others=0&page=bad&channelPage=4&ignored=x");
  expect(salesWorkspaceControls(params, false)).toEqual({ groupBy: "brand", metric: "invalid", others: "0", page: "bad", channelPage: "4" });
  expect(salesWorkspaceControls(new URLSearchParams(), true)).toEqual({ groupBy: "category" });
  expect(salesWorkspaceControls(new URLSearchParams(), false)).toEqual({ groupBy: "brand" });
  expect(params.get("ignored")).toBe("x");
});
it("passes stock defaults and only stock-specific controls to its request", () => {
  StockWorkspace();
  expect(mocks.screen).toHaveBeenCalledWith({ channelId: "c" }, "stock", { groupBy: "category", sort: "stockCost", direction: "desc", page: "2" });
});
it("preserves stock filters and invalid drafts while excluding controls from other screens", () => {
  const params = new URLSearchParams("groupBy=sku&sort=invalid&direction=&page=bad&classification=RISK&ownership=OWN&supplierId=supplier&categoryPage=4&brandPage=3&categorySort=DEAD&categoryDirection=asc&measure=units&ignored=x");
  const before = params.toString();
  expect(stockWorkspaceControls(params)).toEqual({
    groupBy: "sku", sort: "invalid", direction: "", page: "bad", classification: "RISK", ownership: "OWN", supplierId: "supplier",
    categoryPage: "4", brandPage: "3", categorySort: "DEAD", categoryDirection: "asc",
  });
  expect(stockWorkspaceControls(new URLSearchParams())).toEqual({ groupBy: "category", sort: "stockCost", direction: "desc" });
  expect(stockWorkspaceControls(new URLSearchParams("groupBy=invalid&classification=&page=0"))).toEqual({ groupBy: "category", sort: "stockCost", direction: "desc", page: "0" });
  expect(params.toString()).toBe(before);
});
