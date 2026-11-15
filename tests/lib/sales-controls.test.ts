import { isValidElement, type ReactNode } from "react";
import { expect, it } from "vitest";
import { SalesControls } from "@/components/sales/sales-controls/sales-controls";
import { SalesControlGroup } from "@/components/sales/sales-control-group/sales-control-group";
import { Button } from "@/components/ui/button/button";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import { salesCopy } from "@/lib/sales-copy";

function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
const model = { groupBy: "category" as const, measure: "money" as const, metric: "gmPct" as const, monobrand: false };
const params = new URLSearchParams("snapshotId=pinned&dateFrom=2026-10-01&dateTo=2026-10-31&channelId=1&page=3&channelPage=2&others=1&metric=gmPct");
const href = (values: Record<string, string | null>) => merchandisingHref("/sales", params, { page: params.get("page"), channelPage: params.get("channelPage"), ...values });
it.each(["uk", "en"] as const)("preserves filter-aware transitions and active states in %s", lang => {
  const copy = salesCopy[lang];
  const groups = nodes(SalesControls({ model, copy, href })).filter(node => node.type === SalesControlGroup);
  expect(groups.map(group => group.props.label)).toEqual([copy.group, copy.measure, copy.metric]);
  for (const group of groups) {
    const tree = nodes(SalesControlGroup(group.props as Parameters<typeof SalesControlGroup>[0]));
    const active = tree.filter(node => node.props["aria-current"] === "true");
    expect(active).toHaveLength(1);
    expect(active[0].props.children).toBe(group.props.options.find((option: { key: string }) => option.key === group.props.value).label);
    for (const option of group.props.options) {
      const url = new URL(option.href, "https://example.test");
      expect(url.searchParams.get("snapshotId")).toBe("pinned");
      expect(url.searchParams.get("channelId")).toBe("1");
      expect(url.searchParams.get("dateFrom")).toBe("2026-10-01");
      expect(url.searchParams.has("page")).toBe(false);
      if (group.props.label !== copy.metric) {
        expect(url.searchParams.has("channelPage")).toBe(false);
        expect(url.searchParams.has("others")).toBe(false);
      } else {
        expect(url.searchParams.get("channelPage")).toBe("2");
        expect(url.searchParams.get("others")).toBe("1");
      }
    }
  }
  const units = groups[1].props.options.find((option: { key: string }) => option.key === "units");
  expect(new URL(units.href, "https://example.test").searchParams.get("metric")).toBe("revenue");
});
it("omits brand grouping for monobrand and disables financial metrics for units", () => {
  const copy = salesCopy.en;
  const groups = nodes(SalesControls({ model: { ...model, monobrand: true, measure: "units" }, copy, href })).filter(node => node.type === SalesControlGroup);
  expect(groups[0].props.options.map((option: { key: string }) => option.key)).toEqual(["category", "sku"]);
  const metrics = nodes(SalesControlGroup(groups[2].props as Parameters<typeof SalesControlGroup>[0]));
  const buttons = metrics.filter(node => node.type === Button);
  expect(buttons).toHaveLength(3);
  expect(buttons.every(button => button.props.disabled && button.props.title === copy.financialDisabled)).toBe(true);
  expect(metrics.some(node => node.props.href || node.props["aria-current"])).toBe(false);
});
