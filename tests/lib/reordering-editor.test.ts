import { isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import Editor from "@/components/reordering/reordering-editor/reordering-editor";
import Summary from "@/components/reordering/reordering-summary/reordering-summary";
import { ReorderingSupplierGroups } from "@/components/reordering/reordering-supplier-groups/reordering-supplier-groups";
import { ScenarioPreviewStatus } from "@/components/merchandising/scenario-preview-status/scenario-preview-status";
import { reorderingCopy } from "@/lib/reordering-copy";
import { initialReorderingState } from "@/lib/reordering-workspace";
const mocks = vi.hoisted(() => ({ preview: vi.fn(), allowed: true, prepare: vi.fn(), editor: vi.fn() }));
vi.mock("@/components/reordering/use-reordering-editor", () => ({ useReorderingEditor: mocks.editor }));
vi.mock("@/components/merchandising/use-scenario-preview", () => ({ useScenarioPreview: mocks.preview }));
vi.mock("@/components/merchandising/merchandising-shell/merchandising-shell", () => ({ useScenarioExportPermission: () => mocks.allowed }));
vi.mock("@/components/merchandising/use-scenario-export", () => ({ useScenarioExport: () => ({ busy: false, prepare: mocks.prepare }) }));
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  const state = initialReorderingState(new URLSearchParams());
  mocks.editor.mockReturnValue({ state, draft: state.draft });
  mocks.preview.mockReturnValue({ current: true, error: null, sameControls: true, data: { previewId: "preview", canExport: true } });
});
it.each(["pending", "error", "forbidden", "cannot-export", "needs-brand"])("blocks summary export for %s", reason => {
  const preview = mocks.preview();
  if (reason === "pending") preview.current = false;
  if (reason === "error") preview.error = { code: "ERROR" };
  if (reason === "forbidden") mocks.allowed = false;
  if (reason === "cannot-export") preview.data.canExport = false;
  if (reason === "needs-brand") mocks.editor().state.draft.mode = "brand";
  const tree = nodes(Editor({ snapshotId: "s", asOf: "2026-11-15", lang: "en", onRefresh: vi.fn() }));
  expect(tree.find(node => node.type === Summary)!.props.onExport).toBeUndefined();
  if (["pending", "error", "needs-brand"].includes(reason)) expect(tree.some(node => node.type === ReorderingSupplierGroups)).toBe(false);
});
it("exports the current request and passes supplier scope separately", () => {
  const tree = nodes(Editor({ snapshotId: "s", asOf: "2026-11-15", lang: "en", onRefresh: vi.fn() }));
  tree.find(node => node.type === Summary)!.props.onExport();
  expect(mocks.prepare).toHaveBeenLastCalledWith("preview", expect.objectContaining({ snapshotId: "s", page: 1 }));
  tree.find(node => node.type === ReorderingSupplierGroups)!.props.onExport("supplier", "EUR");
  expect(mocks.prepare).toHaveBeenLastCalledWith("preview", expect.any(Object), { supplierId: "supplier", currency: "EUR" });
});
it("prompts for a brand while loading brand options", () => {
  mocks.editor().state.draft.mode = "brand";
  mocks.preview().busy = true;
  const tree = nodes(Editor({ snapshotId: "s", asOf: "2026-11-15", lang: "en", onRefresh: vi.fn() }));
  const status = tree.find(node => node.type === ScenarioPreviewStatus)!.props;
  expect(ScenarioPreviewStatus(status as Parameters<typeof ScenarioPreviewStatus>[0]).props.children)
    .toBe(reorderingCopy.en.chooseBrand);
});
