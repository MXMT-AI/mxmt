import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CsvPreviewPanel } from "@/components/settings/csv-preview-panel/csv-preview-panel";
import type { CsvPreview } from "@/components/settings/csv-import-card/csv-import-types";
const preview: CsvPreview = { id: "packet", sourceId: "csv", contentHash: "sha256-demo", state: "READY", expiresAt: "2026-11-20T12:00:00Z", preview: { counts: { orders: 3 }, errors: [], warnings: [] } };
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function render(packet = preview, busy = false) {
  const onAction = vi.fn();
  const tree = nodes(CsvPreviewPanel({ preview: packet, lang: "en", busy, suppliers: [], onAction }));
  return { tree, buttons: tree.filter(node => node.type === "button"), onAction };
}
it.each(["READY", "QUEUED", "ACTIVE", "CANCELLED", "EXPIRED"])("preserves action availability for %s packets", state => {
  const { buttons } = render({ ...preview, state });
  const activate = buttons.find(button => button.props.children === "Activate validated packet")!.props;
  const cancel = buttons.find(button => button.props.children === "Cancel packet")!.props;
  expect(activate.disabled).toBe(state !== "READY");
  expect(cancel.disabled).toBe(["ACTIVE", "CANCELLED", "EXPIRED"].includes(state));
  expect(buttons.some(button => button.props.children === "Continue import")).toBe(state === "QUEUED");
});
it("blocks activation with validation errors and blocks every action while busy", () => {
  const invalid = { ...preview, preview: { ...preview.preview, errors: [{ resource: "orders", row: 2, code: "INVALID_DATE" }] } };
  expect(render(invalid).buttons.find(button => button.props.children === "Activate validated packet")!.props.disabled).toBe(true);
  expect(render({ ...preview, state: "QUEUED" }, true).buttons.every(button => button.props.disabled)).toBe(true);
});
it.each(["FAILED", "PAUSED", "RETRY", "RUNNING"])("continues %s jobs with the correct operation", state => {
  const { buttons, onAction } = render({ ...preview, state: "QUEUED", job: { state, errorCode: null } });
  buttons.find(button => button.props.children === "Continue import")!.props.onClick();
  expect(onAction).toHaveBeenCalledWith(state === "RUNNING" ? "process" : "retry");
});
it("passes activate and cancel operations to the parent", () => {
  const { buttons, onAction } = render();
  buttons.find(button => button.props.children === "Activate validated packet")!.props.onClick();
  buttons.find(button => button.props.children === "Cancel packet")!.props.onClick();
  expect(onAction.mock.calls.map(call => call[0])).toEqual(["activate", "cancel"]);
});
it.each(["uk", "en"] as const)("renders frozen mappings, warnings and row correction links in %s", lang => {
  const packet: CsvPreview = {
    ...preview,
    options: { schemaVersion: 1, mappingRevision: 2, timezone: "Europe/Kyiv", catalog: "partial", stock: "partial", history: null, receiptHistory: null, discountUnit: "amount", approved: true, policy: { statuses: { "5": "SALE" }, channels: { "1": "Shop" }, amounts: { price: "gross_unit", absoluteDiscount: "line", currency: "UAH", cost: "unit" } } },
    mappings: [{ resource: "orders", delimiter: ",", columns: { id: "Order ID" } }],
    preview: { ...preview.preview, errors: [{ resource: "orders", row: 2, code: "INVALID_DATE", field: "date" }], warnings: ["Missing history"] },
    job: { state: "PAUSED", errorCode: "TEST_ERROR" },
  };
  const html = renderToStaticMarkup(createElement(CsvPreviewPanel, { preview: packet, lang, busy: false, suppliers: [], onAction: vi.fn() }));
  expect(html).toContain('href="#csv-file-orders"');
  expect(html).toContain('href="/api/connectors/csv/uploads/packet?file=orders"');
  expect(html).toContain("id: Order ID");
  expect(html).toContain("Europe/Kyiv · UAH");
  expect(html).toContain("sha256-demo");
  expect(html).toContain("Missing history");
  expect(html).toContain("TEST_ERROR");
  expect(html).toContain(lang === "en" ? "Use YYYY-MM-DD" : "Використайте YYYY-MM-DD");
});
