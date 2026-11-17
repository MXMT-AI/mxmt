import { isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import ReorderingWorkspace from "@/components/reordering/reordering-workspace/reordering-workspace";
import RepricingWorkspace from "@/components/repricing/repricing-workspace/repricing-workspace";
import ReorderingEditor from "@/components/reordering/reordering-editor/reordering-editor";
import RepricingEditor from "@/components/repricing/repricing-editor/repricing-editor";
import ReportingError from "@/components/merchandising/reporting-error/reporting-error";
import ReportReadiness from "@/components/merchandising/report-readiness/report-readiness";
import { ScenarioWorkspaceHeader } from "@/components/merchandising/scenario-workspace-header/scenario-workspace-header";
import { ScenarioWorkspaceFrame } from "@/components/merchandising/scenario-workspace-frame/scenario-workspace-frame";
import { Button } from "@/components/ui/button/button";
import { reorderingCopy } from "@/lib/reordering-copy";
import { repricingCopy } from "@/lib/repricing-copy";
const mocks = vi.hoisted(() => ({ screen: vi.fn(), refresh: vi.fn(), lang: "en" }));
vi.mock("next/navigation", async load => ({ ...await load<typeof import("next/navigation")>(), useSearchParams: () => new URLSearchParams("period=custom&dateFrom=2026-10-01&dateTo=2026-10-31&channelId=c&snapshotId=s&mode=brand&page=2") }));
vi.mock("@/components/language-provider/language-provider", () => ({ useLang: () => ({ lang: mocks.lang }) }));
vi.mock("@/components/merchandising/merchandising-shell/merchandising-shell", () => ({ useMerchandisingFilters: () => ({ channelId: "c" }) }));
vi.mock("@/components/merchandising/use-merchandising-screen", () => ({ useMerchandisingScreen: mocks.screen }));
vi.mock("@/components/reordering/reordering-editor/reordering-editor", () => ({ default: () => null }));
vi.mock("@/components/repricing/repricing-editor/repricing-editor", () => ({ default: () => null }));
function nodes(node: ReactNode): { type: unknown; props: Record<string, any>; key: unknown }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props, key: node.key }, ...nodes(node.props.children)];
}
const report = { context: { snapshotId: "s", asOf: "2026-11-01", profileMode: "MONOBRAND" }, readiness: {} };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.screen.mockReturnValue({ data: report, busy: false, error: "", refresh: mocks.refresh });
});
for (const [Workspace, Editor, copy, screen] of [
  [ReorderingWorkspace, ReorderingEditor, reorderingCopy, "reordering"],
  [RepricingWorkspace, RepricingEditor, repricingCopy, "repricing"],
] as const) {
  const renderWorkspace = () => {
    const workspace = Workspace();
    expect(workspace.type).toBe(ScenarioWorkspaceFrame);
    return nodes(ScenarioWorkspaceFrame(workspace.props));
  };
  it.each(["uk", "en"] as const)(`preserves ${screen} header, filters and editor context in %s`, lang => {
    mocks.lang = lang;
    const tree = renderWorkspace();
    const header = tree.find(node => node.type === ScenarioWorkspaceHeader)!.props;
    expect(header.copy).toBe(copy[lang]);
    const href = new URL(header.backHref, "https://example.test");
    expect(href.pathname).toBe("/overview");
    expect(href.searchParams.get("channelId")).toBe("c");
    expect(href.searchParams.get("dateFrom")).toBe("2026-10-01");
    expect(href.searchParams.get("snapshotId")).toBe("s");
    expect(href.searchParams.has("mode")).toBe(false);
    expect(href.searchParams.has("page")).toBe(false);
    const button = nodes(ScenarioWorkspaceHeader(header as Parameters<typeof ScenarioWorkspaceHeader>[0])).find(node => node.type === Button)!.props;
    expect(button.disabled).toBe(false);
    button.onClick();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    const editor = tree.find(node => node.type === Editor)!;
    expect(editor.key).toBe("s");
    expect(editor.props).toMatchObject({ snapshotId: "s", monobrand: true, lang, onRefresh: mocks.refresh });
    if (screen === "reordering") expect(editor.props.asOf).toBe(report.context.asOf);
    expect(tree.some(node => node.type === ReportReadiness)).toBe(true);
    expect(mocks.screen).toHaveBeenCalledWith({ channelId: "c" }, screen);
  });
  it.each(["loading", "empty", "error"])(`preserves ${screen} %s state`, state => {
    mocks.screen.mockReturnValue({ data: state === "empty" ? null : report, busy: state === "loading", error: state === "error" ? "SOURCE_ERROR" : "", refresh: mocks.refresh });
    const tree = renderWorkspace();
    expect(tree.some(node => node.type === Editor)).toBe(false);
    expect(tree.some(node => node.type === ReportReadiness)).toBe(false);
    const header = tree.find(node => node.type === ScenarioWorkspaceHeader)!.props;
    expect(header.busy).toBe(state === "loading");
    if (state === "error") {
      expect(tree.find(node => node.type === ReportingError)!.props.onRetry).toBe(mocks.refresh);
    } else {
      expect(tree.some(node => node.props.role === "status")).toBe(true);
    }
  });
}
