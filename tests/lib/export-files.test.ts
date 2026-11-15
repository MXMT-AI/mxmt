import { isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ExportFiles } from "@/components/merchandising/export-files/export-files";
import { ExportHistory } from "@/components/merchandising/export-history/export-history";
import { Button } from "@/components/ui/button/button";
import type { ScenarioExportReceipt } from "@/lib/scenario-export-contract";
const state = vi.hoisted(() => ({ page: 1 }));
vi.mock("react", async load => ({ ...await load<typeof import("react")>(), useState: () => [state.page, (update: (page: number) => number) => { state.page = update(state.page); }] }));
const receipt: ScenarioExportReceipt = {
  exportId: "e", actionId: "a", kind: "reorder", previewId: "p", createdAt: "2026-10-26T10:00:00Z", actorId: "owner",
  files: Array.from({ length: 21 }, (_, i) => ({ id: String(i), name: `${i}.csv`, sha256: "hash", byteLength: 12, rowCount: 2, supplierId: "supplier", currency: "UAH", url: `/exports?file=${i}` })),
};
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
const render = () => nodes(ExportFiles({ receipt, lang: "en" }));
beforeEach(() => { state.page = 1; });
it("paginates 21 downloads locally with disabled controls at the boundaries", () => {
  let tree = render();
  expect(tree.filter(n => n.type === "a").map(n => n.props.download)).toEqual(Array.from({ length: 10 }, (_, i) => `${i}.csv`));
  expect(tree.filter(n => n.type === Button)[0].props.disabled).toBe(true);
  tree.filter(n => n.type === Button)[1].props.onClick();
  tree = render();
  expect(tree.filter(n => n.type === "a")[0].props.href).toBe("/exports?file=10");
  tree.filter(n => n.type === Button)[1].props.onClick();
  tree = render();
  expect(tree.filter(n => n.type === "a").map(n => n.props.download)).toEqual(["20.csv"]);
  expect(tree.filter(n => n.type === Button)[1].props.disabled).toBe(true);
  tree.filter(n => n.type === Button)[0].props.onClick();
  expect(state.page).toBe(2);
});
it("hides pagination for ten files or fewer", () => {
  const tree = nodes(ExportFiles({ receipt: { ...receipt, files: receipt.files.slice(0, 10) }, lang: "en" }));
  expect(tree.some(n => n.type === "nav")).toBe(false);
});
it("retries history loading and hides download components from viewers", () => {
  const onRetry = vi.fn();
  const props = { history: [receipt], error: true, onRetry, allowed: true, lang: "en" as const };
  nodes(ExportHistory(props)).find(n => n.type === Button)!.props.onClick();
  expect(onRetry).toHaveBeenCalledOnce();
  const viewer = nodes(ExportHistory({ ...props, error: false, allowed: false }));
  expect(viewer.some(n => n.type === ExportFiles)).toBe(false);
  expect(viewer.some(n => n.type === "time" && n.props.dateTime === receipt.createdAt)).toBe(true);
});
