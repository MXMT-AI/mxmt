import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SheetsMappingPreviewPanel } from "@/components/settings/sheets-mapping-preview-panel/sheets-mapping-preview-panel";
import { Button } from "@/components/ui/button/button";
import { sheetsMappingMessage } from "@/lib/sheets-mapping-copy";
import type { SheetsMappingPreview } from "@/lib/sheets-mapping-contract";
const preview: SheetsMappingPreview = {
  configId: "config", sourceId: "source", revision: 2, importRunId: "import", previewHash: "hash", expiresAt: "2026-11-15T12:00:00Z",
  summary: {
    counts: { products: 2, orders: 0 }, invalidRows: { products: 1, orders: 0 },
    unmappedStatuses: 1, unverifiedProductKinds: 2, duplicateProductIds: 0, duplicateOrderLines: 0,
    statusCounts: {}, channelCounts: {}, categoryCounts: {},
    problems: [{ code: "PRODUCT_VALUE_UNAVAILABLE", resource: "products", row: 3, field: "sku" }], problemCount: 120,
    blockingErrors: [], warnings: ["PRODUCT_VALUE_UNAVAILABLE"],
  },
};
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function props() {
  return { preview, lang: "en" as const, reference: "Reviewed demo", confirmed: true, busy: false, onReferenceChange: vi.fn(), onConfirmedChange: vi.fn(), onApprove: vi.fn() };
}
it.each([
  [false, true, "Reviewed demo", [], false],
  [true, true, "Reviewed demo", [], true],
  [false, false, "Reviewed demo", [], true],
  [false, true, "", [], true],
  [false, true, "   ", [], true],
  [false, true, "Reviewed demo", ["PRODUCT_ID_MISSING"], true],
] as const)("guards approval for busy=%s, confirmed=%s, reference=%s, errors=%j", (busy, confirmed, reference, errors, disabled) => {
  const tree = nodes(SheetsMappingPreviewPanel({ ...props(), busy, confirmed, reference, preview: { ...preview, summary: { ...preview.summary, blockingErrors: [...errors] } } }));
  expect(tree.find(node => node.type === Button)!.props.disabled).toBe(disabled);
});
it.each(["uk", "en"] as const)("keeps totals, unknown-value guidance and sampled row issues localized in %s", lang => {
  const html = renderToStaticMarkup(createElement(SheetsMappingPreviewPanel, { ...props(), lang }));
  expect(html).toContain(lang === "uk" ? "Товарів: 2" : "Products: 2");
  expect(html).toContain(lang === "uk" ? "Рядків замовлень: 0" : "Order lines: 0");
  expect(html).toContain(lang === "uk" ? "Невідомі показники не замінюються нулями" : "Unknown metrics are not replaced with zero");
  expect(html).toContain(lang === "uk" ? "Зауваження" : "Issues");
  expect(html).toContain("(120)");
  expect(html).toContain(lang === "uk" ? "рядок 3" : "row 3");
  expect(html).toContain(sheetsMappingMessage("PRODUCT_VALUE_UNAVAILABLE", lang));
  expect(html).toContain(lang === "uk" ? "Показано до 100 прикладів" : "Up to 100 examples are shown");
});
it("forwards reference edits, confirmation and approval without mutating preview data", () => {
  const options = props(), tree = nodes(SheetsMappingPreviewPanel(options));
  const inputs = tree.filter(node => node.type === "input");
  inputs[0].props.onChange({ target: { value: "Updated evidence" } });
  inputs[1].props.onChange({ target: { checked: false } });
  tree.find(node => node.type === Button)!.props.onClick();
  expect(options.onReferenceChange).toHaveBeenCalledWith("Updated evidence");
  expect(options.onConfirmedChange).toHaveBeenCalledWith(false);
  expect(options.onApprove).toHaveBeenCalledOnce();
  expect(preview.previewHash).toBe("hash");
});
