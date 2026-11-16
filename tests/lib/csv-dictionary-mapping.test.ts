import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import StatusMappingFields from "@/components/settings/status-mapping-fields/status-mapping-fields";
import { csvStatusMappingConfig } from "@/components/settings/csv-import-card/csv-status-mapping-config";
import { ChannelMappingFields } from "@/components/settings/channel-mapping-fields/channel-mapping-fields";
import { Button } from "@/components/ui/button/button";
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it("keeps CSV-specific meanings, numeric code rules and new-row defaults", () => {
  const rows = [{ id: "5", kind: "SALE" }, { id: "7", kind: "RETURN" }], onChange = vi.fn();
  const tree = nodes(StatusMappingFields({ rows, onChange, lang: "en", config: csvStatusMappingConfig }));
  const code = tree.find(node => node.type === "input")!.props;
  expect(code.pattern).toBe("(0|[1-9][0-9]{0,8})");
  expect(code.required).toBe(true);
  const select = tree.find(node => node.type === "select")!;
  expect(nodes(select.props.children).filter(node => node.type === "option").map(node => node.props.value)).toEqual(["SALE", "RETURN", "CORRECTION", "PREORDER", "REFUSAL"]);
  code.onChange({ target: { value: "9" } });
  expect(onChange).toHaveBeenLastCalledWith([{ id: "9", kind: "SALE" }, rows[1]]);
  tree.find(node => node.type === Button)!.props.onClick();
  expect(onChange).toHaveBeenLastCalledWith([...rows, { id: "", kind: "SALE" }]);
  expect(rows[0].id).toBe("5");
});
it("retains connector defaults, unverified option and 100-row limit", () => {
  const onChange = vi.fn();
  const tree = nodes(StatusMappingFields({ rows: [{ id: "1", kind: "" }], onChange, lang: "en" }));
  expect(tree.find(node => node.type === "input")!.props.pattern).toBe("[0-9]+");
  expect(tree.filter(node => node.type === "option").map(node => node.props.value)).toEqual(["", "SALE", "PREORDER", "REFUSAL"]);
  tree.find(node => node.type === Button)!.props.onClick();
  expect(onChange).toHaveBeenCalledWith([{ id: "1", kind: "" }, { id: "", kind: "" }]);
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i), kind: "SALE" }));
  expect(nodes(StatusMappingFields({ rows, onChange, lang: "en" })).find(node => node.type === Button)!.props.disabled).toBe(true);
  expect(nodes(StatusMappingFields({ rows, onChange, lang: "en", config: csvStatusMappingConfig })).find(node => node.type === Button)!.props.disabled).toBe(false);
});
it("changes only the selected status meaning and preserves source rows", () => {
  const rows = [{ id: "1", kind: "SALE" }, { id: "2", kind: "PREORDER" }], onChange = vi.fn();
  const selects = nodes(StatusMappingFields({ rows, onChange, lang: "en" })).filter(node => node.type === "select");
  selects[1].props.onChange({ target: { value: "REFUSAL" } });
  expect(onChange).toHaveBeenCalledWith([rows[0], { id: "2", kind: "REFUSAL" }]);
  expect(rows[1].kind).toBe("PREORDER");
});
it("enforces the connector row limit in its action while CSV stays unlimited", () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i), kind: "SALE" })), onChange = vi.fn();
  nodes(StatusMappingFields({ rows, onChange, lang: "en" })).find(node => node.type === Button)!.props.onClick();
  expect(onChange).not.toHaveBeenCalled();
  nodes(StatusMappingFields({ rows, onChange, lang: "en", config: csvStatusMappingConfig })).find(node => node.type === Button)!.props.onClick();
  expect(onChange).toHaveBeenCalledWith([...rows, { id: "", kind: "SALE" }]);
});
it("edits and adds channels without changing unrelated rows", () => {
  const rows = [{ code: "1", name: "Shop" }, { code: "web", name: "Website" }], onChange = vi.fn();
  const tree = nodes(ChannelMappingFields({ rows, onChange, lang: "en" }));
  const inputs = tree.filter(node => node.type === "input");
  expect(inputs.every(node => node.props.required)).toBe(true);
  expect(inputs[1].props.maxLength).toBe(200);
  inputs[2].props.onChange({ target: { value: "online" } });
  expect(onChange).toHaveBeenLastCalledWith([rows[0], { code: "online", name: "Website" }]);
  inputs[1].props.onChange({ target: { value: "" } });
  expect(onChange).toHaveBeenLastCalledWith([{ code: "1", name: "" }, rows[1]]);
  tree.find(node => node.type === Button)!.props.onClick();
  expect(onChange).toHaveBeenLastCalledWith([...rows, { code: "", name: "" }]);
  expect(rows[1].code).toBe("web");
});
it.each(["uk", "en"] as const)("localizes both dictionary editors in %s", lang => {
  const statuses = renderToStaticMarkup(createElement(StatusMappingFields, { rows: [], onChange: vi.fn(), lang, config: csvStatusMappingConfig }));
  const channels = renderToStaticMarkup(createElement(ChannelMappingFields, { rows: [], onChange: vi.fn(), lang }));
  expect(statuses).toContain(lang === "en" ? "Add status" : "Додати статус");
  expect(channels).toContain(lang === "en" ? "Add channel" : "Додати канал");
});
