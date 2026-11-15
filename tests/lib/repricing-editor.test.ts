import { isValidElement, useEffect, useRef, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import Editor from "@/components/repricing/repricing-editor/repricing-editor";
import Summary from "@/components/repricing/repricing-summary/repricing-summary";
import { AlertPanel } from "@/components/ui/alert-panel/alert-panel";
import { initialRepricingState, readRepricingDraft } from "@/lib/repricing-workspace";
import { repricingCopy } from "@/lib/repricing-copy";
const mocks = vi.hoisted(() => ({ preview: vi.fn(), inputs: vi.fn(), allowed: true, prepare: vi.fn(), editor: vi.fn(), retryInputs: vi.fn(), retryPreview: vi.fn() }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useEffect: vi.fn(), useRef: vi.fn() }));
vi.mock("@/components/repricing/use-repricing-editor", () => ({ useRepricingEditor: mocks.editor }));
vi.mock("@/components/repricing/use-repricing-preview", () => ({ useRepricingInputs: mocks.inputs, useRepricingPreview: mocks.preview }));
vi.mock("@/components/merchandising/merchandising-shell/merchandising-shell", () => ({ useScenarioExportPermission: () => mocks.allowed }));
vi.mock("@/components/merchandising/use-scenario-export", () => ({ useScenarioExport: () => ({ busy: false, prepare: mocks.prepare }) }));
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
let context: { current: string | undefined };
const refresh = vi.fn();
function render() { return nodes(Editor({ snapshotId: "s", lang: "en", onRefresh: refresh })); }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  context = { current: undefined };
  vi.mocked(useRef).mockReturnValue(context);
  const state = initialRepricingState(readRepricingDraft(new URLSearchParams()));
  mocks.editor.mockReturnValue({ state, draft: state.draft });
  mocks.inputs.mockReturnValue({ data: { inputSetId: "inputs", context: { asOf: "2026-11-15" } }, error: null, retry: mocks.retryInputs });
  mocks.preview.mockReturnValue({ current: true, error: null, sameControls: true, retry: mocks.retryPreview, data: { previewId: "preview", editContext: "ctx", canExport: true, counts: {} } });
});
it.each(["pending", "input-error", "preview-error", "forbidden", "cannot-export"])("blocks export for %s", reason => {
  if (reason === "pending") mocks.preview().current = false;
  if (reason === "input-error") mocks.inputs().error = { code: "ERROR" };
  if (reason === "preview-error") mocks.preview().error = { code: "ERROR" };
  if (reason === "forbidden") mocks.allowed = false;
  if (reason === "cannot-export") mocks.preview().data.canExport = false;
  expect(render().find(node => node.type === Summary)!.props.onExport).toBeUndefined();
});
it.each([true, false])("retries the failed request with input-error=%s", inputsFailed => {
  const failure = { code: "STALE_REPRICING_EDITS" };
  mocks.preview().error = failure;
  if (inputsFailed) mocks.inputs().error = { code: "REPRICING_SOURCE_CHANGED" };
  const alert = render().find(node => node.type === AlertPanel)!.props;
  expect(alert.message).toBe(inputsFailed ? repricingCopy.en.sourceChanged : repricingCopy.en.staleEdits);
  const retry = nodes(alert.children).find(node => node.props.children === repricingCopy.en.retry)!.props;
  retry.onClick();
  expect(inputsFailed ? mocks.retryInputs : mocks.retryPreview).toHaveBeenCalledOnce();
});
it("keeps edit context from settled previews and includes it only with manual edits", () => {
  render();
  expect(mocks.preview.mock.lastCall![0]).not.toHaveProperty("editContext");
  vi.mocked(useEffect).mock.lastCall![0]();
  expect(context.current).toBe("ctx");
  mocks.editor().state.edits.manualPrices = [{ skuId: "sku", price: "12" }];
  mocks.preview().current = false;
  mocks.preview().data.editContext = "pending-context";
  render();
  vi.mocked(useEffect).mock.lastCall![0]();
  expect(context.current).toBe("ctx");
  expect(mocks.preview.mock.lastCall![0].editContext).toBe("ctx");
  mocks.preview().current = true;
  render().find(node => node.type === Summary)!.props.onExport();
  expect(mocks.prepare).toHaveBeenCalledWith("preview", expect.objectContaining({ inputSetId: "inputs", editContext: "ctx" }));
});
