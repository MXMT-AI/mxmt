import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CsvFileMapping } from "@/components/settings/csv-file-mapping/csv-file-mapping";
import { CSV_FIELDS, CSV_REQUIRED, type CsvResource } from "@/lib/connectors/csv/schema";
import type { CsvFileDraft } from "@/components/settings/csv-import-card/csv-import-types";
function nodes(node: ReactNode): { type: unknown; props: Record<string, any>; key: unknown }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props, key: node.key }, ...nodes(node.props.children)];
}
const callbacks = () => ({ onChoose: vi.fn(), onDelimiter: vi.fn(), onColumnChange: vi.fn() });
it.each(Object.keys(CSV_FIELDS) as CsvResource[])("preserves anchors, templates and required mappings for %s", resource => {
  const draft: CsvFileDraft = { name: "demo.csv", headers: ["Source header"], file: { resource, bytes: "", delimiter: ";", columns: {} } };
  const tree = nodes(CsvFileMapping({ resource, draft, delimiter: ";", lang: "en", ...callbacks() }));
  expect(tree[0].props.id).toBe(`csv-file-${resource}`);
  const template = tree.find(node => node.type === "a")!.props;
  expect(template.download).toBe(`${resource}-v1.csv`);
  expect(decodeURIComponent(template.href.split(",").slice(1).join(","))).toBe(CSV_FIELDS[resource].join(",") + "\n");
  const mapped = tree.filter(node => node.type === "select").slice(1);
  expect(mapped).toHaveLength(CSV_FIELDS[resource].length);
  expect(mapped.filter(node => node.props.required)).toHaveLength(CSV_REQUIRED[resource].length);
  expect(mapped.every(node => node.props.value === "")).toBe(true);
  expect(tree.filter(node => node.type === "option" && node.props.value === "Source header")).toHaveLength(CSV_FIELDS[resource].length);
});
it("passes selected files and clears the native value so the same file can be selected again", () => {
  const actions = callbacks();
  const tree = nodes(CsvFileMapping({ resource: "orders", lang: "en", ...actions }));
  const fileInput = tree.find(node => node.props.type === "file")!.props;
  const file = new File(["id\n1"], "demo.csv", { type: "text/csv" });
  const currentTarget = { value: "demo.csv" };
  fileInput.onChange({ target: { files: [file] }, currentTarget });
  expect(currentTarget.value).toBe("");
  expect(actions.onChoose).toHaveBeenCalledWith("orders", file);
  fileInput.onChange({ target: { files: [] }, currentTarget });
  expect(actions.onChoose).toHaveBeenLastCalledWith("orders", undefined);
  expect(tree.filter(node => node.type === "select")).toHaveLength(1);
});
it("passes delimiter, mapping and cleared mapping changes to the parent", () => {
  const actions = callbacks();
  const field = CSV_FIELDS.orders[0];
  const draft: CsvFileDraft = { name: "demo.csv", headers: ["ID"], file: { resource: "orders", bytes: "", delimiter: ",", columns: { [field]: "ID" } } };
  const selects = nodes(CsvFileMapping({ resource: "orders", draft, lang: "en", ...actions })).filter(node => node.type === "select");
  expect(selects[0].props.value).toBe(",");
  selects[0].props.onChange({ target: { value: "\t" } });
  expect(actions.onDelimiter).toHaveBeenCalledWith("orders", "\t");
  expect(selects[1].props.value).toBe("ID");
  selects[1].props.onChange({ target: { value: "" } });
  expect(actions.onColumnChange).toHaveBeenCalledWith("orders", field, "");
});
it.each(["uk", "en"] as const)("renders file controls in %s", lang => {
  const html = renderToStaticMarkup(createElement(CsvFileMapping, { resource: "orders", lang, ...callbacks() }));
  expect(html).toContain(lang === "en" ? "Order lines" : "Рядки замовлень");
  expect(html).toContain(lang === "en" ? "Delimiter" : "Роздільник");
  expect(html).toContain('accept=".csv,text/csv"');
});
