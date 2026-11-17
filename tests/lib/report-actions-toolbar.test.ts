import { isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button/button";
import { ReportActionsToolbar } from "@/components/data-reporting/report-actions-toolbar/report-actions-toolbar";

function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function start(overrides: Partial<Parameters<typeof ReportActionsToolbar>[0]> = {}) {
  const props: Parameters<typeof ReportActionsToolbar>[0] = {
    lang: "en", copy: { calculate: "Calculate", calculating: "Calculating", import: "Import", importing: "Importing" },
    loading: false, action: null, canCalculate: true, canImport: true, canRefreshReports: true,
    status: { activeImport: { status: "SUCCESS" }, connection: { fileId: "demo", revision: 1 }, latestImport: null },
    onRefresh: vi.fn(), onAction: vi.fn(), ...overrides,
  };
  return { props, buttons: nodes(ReportActionsToolbar(props)).filter(node => node.type === Button).map(node => node.props) };
}

it.each([
  { canCalculate: false, canImport: false, count: 1 },
  { canCalculate: true, canImport: false, count: 2 },
  { canCalculate: true, canImport: true, count: 4 },
])("keeps action visibility for permissions %j", ({ count, ...permissions }) => {
  expect(start(permissions).buttons).toHaveLength(count);
});

it("preserves refresh and each operation callback", () => {
  const { props, buttons } = start();
  for (const button of buttons) button.onClick();
  expect(props.onRefresh).toHaveBeenCalledOnce();
  expect(vi.mocked(props.onAction).mock.calls).toEqual([["calculate"], ["projection"], ["import"]]);
});

it("requires an active import, connection and projection intent independently", () => {
  const { buttons } = start({ status: null, canRefreshReports: false });
  expect(buttons.map(button => button.disabled)).toEqual([false, true, true, true]);
});

it("blocks raw import while a previous import is live", () => {
  const { props } = start();
  const { buttons } = start({ status: { ...props.status!, latestImport: { status: "RUNNING", createdAt: new Date().toISOString() } } });
  expect(buttons.map(button => button.disabled)).toEqual([false, false, false, true]);
});

it("blocks all operations during an action while retaining independent view refresh", () => {
  expect(start({ action: "calculate" }).buttons.map(button => button.disabled)).toEqual([false, true, true, true]);
  expect(start({ loading: true }).buttons[0].disabled).toBe(true);
});
