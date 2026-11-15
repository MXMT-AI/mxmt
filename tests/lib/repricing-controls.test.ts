import { isValidElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { RepricingFilters } from "@/components/repricing/repricing-filters/repricing-filters";
import { RepricingParameters } from "@/components/repricing/repricing-parameters/repricing-parameters";
import { RepricingPercentageField } from "@/components/repricing/repricing-percentage-field/repricing-percentage-field";
import { RangeField } from "@/components/ui/range-field/range-field";
import { Choice } from "@/components/ui/choice/choice";
import { readRepricingDraft, defaultRepricingFilters } from "@/lib/repricing-workspace";
import { REPRICING_PRESETS } from "@/lib/repricing-contract";
import { repricingCopy } from "@/lib/repricing-copy";
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
const copy = repricingCopy.en;
const draft = () => readRepricingDraft(new URLSearchParams("skuId=sku&priceMin=0&liquidation=true&costProtection=false&liquidationReason=Demo"));
it("resets only filters and clears SKU without altering other fields", () => {
  const value = draft(), onChange = vi.fn();
  const tree = nodes(RepricingFilters({ draft: value, onChange, copy, data: null, error: null }));
  tree.find(node => node.props.children === copy.reset)!.props.onClick();
  expect(onChange).toHaveBeenLastCalledWith({ ...value, filters: defaultRepricingFilters() });
  tree.find(node => node.props.children === copy.clearSku)!.props.onClick();
  const { skuId, ...remaining } = value.filters;
  expect(onChange).toHaveBeenLastCalledWith({ ...value, filters: remaining });
});
it("keeps range drafts as strings, including zero and a cleared bound", () => {
  const value = draft(), onChange = vi.fn();
  const tree = nodes(RepricingFilters({ draft: value, onChange, copy, data: null, error: null }));
  const range = tree.find(node => node.type === RangeField)!.props;
  expect(range.from.value).toBe("0");
  range.from.onChange("");
  expect(onChange.mock.lastCall![0].filters.priceMin).toBeUndefined();
  const fields = nodes(RangeField(range as Parameters<typeof RangeField>[0])).filter(node => node.type === "input");
  fields[1].props.onChange({ target: { value: "12.5" } });
  expect(onChange.mock.lastCall![0].filters.priceMax).toBe("12.5");
  expect(fields[0].props["aria-label"]).toBe(`${copy.price} — ${copy.from}`);
});
it("hides brand choice for monobrand and converts sold months to a number", () => {
  const onChange = vi.fn();
  const tree = nodes(RepricingFilters({ monobrand: true, draft: draft(), onChange, copy, data: null, error: null }));
  expect(tree.filter(node => node.type === Choice).map(node => node.props.label)).toEqual([copy.category]);
  tree.find(node => node.props.name === "soldMonths")!.props.onChange({ target: { value: "7" } });
  expect(onChange.mock.lastCall![0].filters.soldMonths).toBe(7);
});
it.each(Object.entries(REPRICING_PRESETS))("applies %s preset without changing protection, reason or filters", (name, preset) => {
  const value = draft(), onChange = vi.fn();
  const tree = nodes(RepricingParameters({ draft: value, onChange, copy, error: null }));
  tree.find(node => node.props.children === copy.presets[name as keyof typeof REPRICING_PRESETS])!.props.onClick();
  expect(onChange).toHaveBeenCalledWith({ ...value, parameters: { ...value.parameters, ...preset } });
});
it("converts percentage and duration controls to numbers and links parameter errors", () => {
  const value = draft(), onChange = vi.fn();
  const tree = nodes(RepricingParameters({ draft: value, onChange, copy, error: { code: "INVALID_REPRICING_REQUEST", details: ["parameters.sharePct: invalid"] } }));
  const percentage = tree.find(node => node.type === RepricingPercentageField && node.props.name === "sharePct")!.props;
  expect(percentage).toMatchObject({ min: 10, max: 100, step: 5, invalid: true, describedBy: "repricing-parameter-error" });
  const input = nodes(RepricingPercentageField(percentage as Parameters<typeof RepricingPercentageField>[0])).find(node => node.type === "input")!.props;
  input.onChange({ target: { value: "45" } });
  expect(onChange.mock.lastCall![0].parameters.sharePct).toBe(45);
  tree.find(node => node.props.name === "durationDays")!.props.onChange({ target: { value: "14" } });
  expect(onChange.mock.lastCall![0].parameters.durationDays).toBe(14);
});
it("clears liquidation and its reason when protection is enabled", () => {
  const value = draft(), onChange = vi.fn();
  const tree = nodes(RepricingParameters({ draft: value, onChange, copy, error: null }));
  tree.find(node => node.props.name === "costProtection")!.props.onChange({ target: { checked: true } });
  expect(onChange.mock.lastCall![0].parameters).toMatchObject({ costProtection: true, liquidation: false, liquidationReason: null });
  tree.find(node => node.props.name === "liquidation")!.props.onChange({ target: { checked: false } });
  expect(onChange.mock.lastCall![0].parameters).toMatchObject({ liquidation: false, liquidationReason: null });
});
