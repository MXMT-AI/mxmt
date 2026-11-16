import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CsvPacketSettings } from "@/components/settings/csv-packet-settings/csv-packet-settings";
import { CsvPopulationRules } from "@/components/settings/csv-population-rules/csv-population-rules";
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
const value = { timezone: "Europe/Kyiv", currency: "UAH", mappingRevision: 1 };
it.each([false, true])("preserves timezone locking and input constraints when locked=%s", timezoneLocked => {
  const fields = nodes(CsvPacketSettings({ value, timezoneLocked, lang: "en", onChange: vi.fn() })).filter(node => node.type === "input");
  expect(fields[0].props).toMatchObject({ readOnly: timezoneLocked, required: true, maxLength: 100 });
  expect(fields[1].props).toMatchObject({ required: true, maxLength: 3, pattern: "[A-Z]{3}" });
  expect(fields[2].props).toMatchObject({ required: true, type: "number", min: 1, max: 1000000 });
});
it("normalizes currency and revision while keeping other settings", () => {
  const onChange = vi.fn();
  const fields = nodes(CsvPacketSettings({ value, timezoneLocked: false, lang: "en", onChange })).filter(node => node.type === "input");
  fields[0].props.onChange({ target: { value: "UTC" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, timezone: "UTC" });
  fields[1].props.onChange({ target: { value: "eur" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, currency: "EUR" });
  fields[2].props.onChange({ target: { value: "7" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...value, mappingRevision: 7 });
  expect(value.currency).toBe("UAH");
});
it("updates population independently for catalog and stock", () => {
  const value = { catalog: "partial" as const, stock: "complete" as const }, onChange = vi.fn();
  const fields = nodes(CsvPopulationRules({ value, lang: "en", onChange })).filter(node => node.type === "select");
  fields[0].props.onChange({ target: { value: "complete" } });
  expect(onChange).toHaveBeenLastCalledWith({ catalog: "complete", stock: "complete" });
  fields[1].props.onChange({ target: { value: "partial" } });
  expect(onChange).toHaveBeenLastCalledWith({ catalog: "partial", stock: "partial" });
  expect(value.stock).toBe("complete");
});
it.each(["uk", "en"] as const)("keeps labels and population explanation in %s", lang => {
  const settings = renderToStaticMarkup(createElement(CsvPacketSettings, { value, timezoneLocked: false, lang, onChange: vi.fn() }));
  expect(settings).toContain(lang === "en" ? "Mapping revision" : "Версія мапінгу");
  const population = renderToStaticMarkup(createElement(CsvPopulationRules, { value: { catalog: "partial", stock: "partial" }, lang, onChange: vi.fn() }));
  expect(population).toContain(lang === "en" ? "Omitted products are not zeroed." : "Пропущені товари не обнуляються.");
  expect(population.match(/value="partial" selected=""/g)).toHaveLength(2);
});
