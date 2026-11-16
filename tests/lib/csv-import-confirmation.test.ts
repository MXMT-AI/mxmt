import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CsvImportConfirmation } from "@/components/settings/csv-import-confirmation/csv-import-confirmation";
import { Button } from "@/components/ui/button/button";
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
for (const approved of [false, true]) for (const busy of [false, true]) for (const hasFiles of [false, true]) {
  it(`gates preview for approved=${approved}, busy=${busy}, files=${hasFiles}`, () => {
    const tree = nodes(CsvImportConfirmation({ approved, busy, hasFiles, lang: "en", onApprove: vi.fn() }));
    const action = tree.find(node => node.type === Button)!.props;
    expect(action.type).toBe("submit");
    expect(action.disabled).toBe(!(approved && !busy && hasFiles));
    expect(action.children).toBe(busy ? "Processing…" : "Preview packet");
    expect(tree.find(node => node.type === "input")!.props).toMatchObject({ required: true, checked: approved });
  });
}
it("passes approval and revocation to the parent", () => {
  const onApprove = vi.fn();
  const input = nodes(CsvImportConfirmation({ approved: false, busy: false, hasFiles: true, lang: "en", onApprove })).find(node => node.type === "input")!.props;
  input.onChange({ target: { checked: true } });
  input.onChange({ target: { checked: false } });
  expect(onApprove.mock.calls).toEqual([[true], [false]]);
});
it.each(["uk", "en"] as const)("renders the explicit confirmation in %s", lang => {
  const html = renderToStaticMarkup(createElement(CsvImportConfirmation, { approved: false, busy: false, hasFiles: true, lang, onApprove: vi.fn() }));
  expect(html).toContain(lang === "en" ? "Brand ownership is not inferred from CSV." : "Власність брендів не визначається з CSV.");
  expect(html).toContain(lang === "en" ? "Preview packet" : "Перевірити пакет");
});
