import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SheetsMappingDictionaries } from "@/components/settings/sheets-mapping-dictionaries/sheets-mapping-dictionaries";
import { Field } from "@/components/ui/field/field";
import { SHEETS_EVENT_KINDS, type SheetsFieldMapping } from "@/lib/sheets-mapping-contract";
type Policy = SheetsFieldMapping["policy"];
const policy: Policy = {
  currency: "UAH", statuses: { saved: "RETURN" }, channels: { web: "Website" },
  salesAmount: "net_line", costAmount: "unavailable", lineIdentity: "column", stockObservation: "unverified",
  stockReference: "", defaultProductKind: "UNKNOWN", productKinds: { Services: "SERVICE" },
};
const observed = { statuses: [{ id: "paid", count: 2 }, { id: "saved", count: 1 }], channels: [{ id: "web", count: 1 }], categories: [{ name: "Services", count: 1 }] };
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function start(customObserved = observed) {
  const onChange = vi.fn();
  const tree = nodes(SheetsMappingDictionaries({ policy, observed: customObserved, lang: "en", onChange }));
  const control = (label: string) => nodes(tree.find(node => node.type === Field && node.props.label === label)!.props.children)[0].props;
  const apply = () => { const result = structuredClone(policy); onChange.mock.lastCall![0](result); return result; };
  return { tree, control, apply };
}
it("merges, sorts and deduplicates observed and saved statuses without inferring a sale", () => {
  const { tree, control, apply } = start();
  expect(tree.filter(node => node.type === Field).map(node => node.props.label)).toEqual(["Status paid", "Status saved", "Channel web", "Services"]);
  expect(control("Status paid").value).toBe("UNKNOWN");
  expect(control("Status saved").value).toBe("RETURN");
  const select = control("Status paid");
  expect(nodes(select.children).filter(node => node.type === "option").map(node => node.props.value)).toEqual(SHEETS_EVENT_KINDS);
  select.onChange({ target: { value: "SALE" } });
  expect(apply().statuses).toEqual({ saved: "RETURN", paid: "SALE" });
});
it("removes an empty channel mapping without touching other rules", () => {
  const { control, apply } = start();
  control("Channel web").onChange({ target: { value: "" } });
  expect(apply()).toEqual({ ...policy, channels: {} });
  expect(policy.channels.web).toBe("Website");
});
it("clears an explicit product kind to restore the default", () => {
  const { control, apply } = start();
  expect(control("Services").value).toBe("SERVICE");
  control("Services").onChange({ target: { value: "" } });
  expect(apply().productKinds).toEqual({});
});
it("treats special source keys as own data properties for every dictionary", () => {
  const { control, apply } = start({ statuses: [{ id: "__proto__", count: 1 }], channels: [{ id: "__proto__", count: 1 }], categories: [{ name: "__proto__", count: 1 }] });
  expect(control("Status __proto__").value).toBe("UNKNOWN");
  expect(control("Channel __proto__").value).toBe("");
  expect(control("__proto__").value).toBe("");
  for (const [label, value, dictionary] of [
    ["Status __proto__", "RETURN", "statuses"], ["Channel __proto__", "Special channel", "channels"], ["__proto__", "GIFT_CARD", "productKinds"],
  ] as const) {
    control(label).onChange({ target: { value } });
    const updated = apply()[dictionary];
    expect(Object.getPrototypeOf(updated)).toBe(Object.prototype);
    expect(Object.hasOwn(updated, "__proto__")).toBe(true);
    expect(updated.__proto__).toBe(value);
  }
});
it("hides optional channel and category editors when their dictionaries are absent", () => {
  const { tree } = start({ statuses: [], channels: [], categories: [] });
  expect(tree.filter(node => node.type === Field).map(node => node.props.label)).toEqual(["Status saved"]);
});
it.each(["uk", "en"] as const)("retains localized unknown-status and return-date guidance in %s", lang => {
  const html = renderToStaticMarkup(createElement(SheetsMappingDictionaries, { policy, observed, lang, onChange: vi.fn() }));
  expect(html).toContain(lang === "uk" ? "Непідтверджені статуси виключаються" : "Unverified statuses are excluded");
  expect(html).toContain(lang === "uk" ? "не є підтвердженою датою повернення" : "does not prove a return date");
});
