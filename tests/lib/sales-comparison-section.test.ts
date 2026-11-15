import { isValidElement, type ReactNode } from "react";
import { expect, it } from "vitest";
import { SalesComparisonSection } from "@/components/sales/sales-comparison-section/sales-comparison-section";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { PartialMarker } from "@/components/ui/partial-marker/partial-marker";
import { salesCopy } from "@/lib/sales-copy";
import { merchandisingHref } from "@/lib/merchandising-navigation";
type Props = Parameters<typeof SalesComparisonSection>[0];
const values = { current: "12", ly: "10", delta: "2", changePct: "0.2", currentPartial: true, lyPartial: false, tone: "GREEN" };
const props: Props = {
  comparison: { rows: [{ ...values, id: null, name: "Unknown", oneOffLy: true }], total: values, available: true },
  period: { from: "2026-10-01", to: "2026-10-31", lyFrom: "2025-10-01", lyTo: "2025-10-31", asOf: "2026-11-01", days: 31, leapDayPolicy: "CLAMP_TO_FEBRUARY_28" },
  history: { current: true, ly: true }, oneOffAvailable: true, group: "category", units: false, copy: salesCopy.en, locale: "en-GB",
  href: values => merchandisingHref("/sales", new URLSearchParams("currency=EUR&snapshotId=s&channelId=c&page=2&others=1"), values),
};
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
function table(value = props) { return nodes(SalesComparisonSection(value)).find(node => node.type === ReportTable)!.props; }
it("keeps summary separate from drill-down rows and preserves scoped links and one-off notes", () => {
  const report = table();
  expect(report.rows).toHaveLength(2);
  const name = report.renderCell(report.rows[0], { key: "name" });
  const tree = nodes(name);
  const link = tree.find(node => node.props.href)!.props;
  const url = new URL(link.href, "https://example.test");
  expect(url.searchParams.get("categoryId")).toBe("__unassigned__");
  expect(url.searchParams.get("groupBy")).toBe("sku");
  expect(url.searchParams.get("currency")).toBe("EUR");
  expect(url.searchParams.get("snapshotId")).toBe("s");
  expect(url.searchParams.has("page")).toBe(false);
  expect(url.searchParams.has("others")).toBe(false);
  expect(tree.some(node => node.props.children === props.copy.oneOff)).toBe(true);
  expect(report.renderCell(report.rows[1], { key: "name" }).type).toBe("strong");
});
it("marks only partial period cells and keeps signed changes", () => {
  const report = table();
  const row = report.rows[0];
  expect(report.renderCell(row, { key: "delta", type: "money" }).props.children[0]).toBe("+");
  const negative = report.renderCell({ ...row, delta: "-2", tone: "RED" }, { key: "delta", type: "money" });
  expect(negative.props.className).toBe("text-report-negative");
  expect(negative.props.children[0]).toBe("");
  const missing = report.renderCell({ ...row, delta: null }, { key: "delta", type: "money" });
  expect(missing.props.children.slice(0, 2)).toEqual(["", "—"]);
  expect(nodes(report.renderCell(row, { key: "current", type: "money" })).some(node => node.type === PartialMarker)).toBe(true);
  expect(nodes(report.renderCell(row, { key: "ly", type: "money" })).some(node => node.type === PartialMarker)).toBe(false);
});
it.each(["uk", "en"] as const)("distinguishes missing history, incomplete coverage and no changes in %s", lang => {
  const copy = salesCopy[lang];
  const incomplete = { ...props, copy, comparison: { ...props.comparison, available: false } };
  expect(nodes(SalesComparisonSection(incomplete)).find(node => node.props.role === "status")!.props.children).toBe(copy.partial);
  expect(nodes(SalesComparisonSection({ ...incomplete, history: { current: true, ly: false } })).find(node => node.props.role === "status")!.props.children).toBe(copy.noLy);
  const empty = nodes(SalesComparisonSection({ ...props, copy, oneOffAvailable: false, comparison: { ...props.comparison, rows: [] } }));
  expect(empty.some(node => node.props.children === copy.noChanges)).toBe(true);
  expect(empty.some(node => node.props.children === copy.noOutliers)).toBe(true);
});
it("uses quantity columns in unit mode", () => {
  const columns = table({ ...props, units: true }).columns;
  expect(columns.find((column: { key: string }) => column.key === "current")).toMatchObject({ type: "quantity", label: props.copy.units });
  expect(columns.find((column: { key: string }) => column.key === "delta").type).toBe("quantity");
});
