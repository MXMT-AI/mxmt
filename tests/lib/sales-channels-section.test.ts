import { isValidElement, type ReactNode } from "react";
import { expect, it } from "vitest";
import { SalesChannelsSection } from "@/components/sales/sales-channels-section/sales-channels-section";
import ReportTable from "@/components/data-reporting/report-table/report-table";
import { ReportTableFooter } from "@/components/data-reporting/report-table/report-table-footer";
import { Pager } from "@/components/ui/pager/pager";
import { PartialMarker } from "@/components/ui/partial-marker/partial-marker";
import { salesCopy } from "@/lib/sales-copy";
import { merchandisingHref } from "@/lib/merchandising-navigation";
import type { SalesCurrencyBlock } from "@/components/sales/sales-types";
const cell = { value: null, partial: true, alpha: null, tone: "NEUTRAL" as const };
const row: SalesCurrencyBlock["channels"]["rows"][number] = { id: null, name: "Unknown", currency: "EUR", kind: "GROUP", rank: 1, groupCount: 1, cells: [], total: cell, share: null };
const pagination = { page: 2, pageSize: 25, totalRows: 30, totalPages: 2 };
const params = new URLSearchParams("currency=EUR&snapshotId=s&dateFrom=2026-10-01&dateTo=2026-10-31&channelId=old&others=1&page=2&channelPage=2");
const href = (values: Record<string, string | null>) => merchandisingHref("/sales", params, { page: "2", channelPage: "2", ...values });
function nodes(node: ReactNode): { type: unknown; props: Record<string, any> }[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [{ type: node.type, props: node.props }, ...nodes(node.props.children)];
}
it.each(["uk", "en"] as const)("preserves unknown channel navigation and partial revenue in %s", lang => {
  const copy = salesCopy[lang];
  const tree = nodes(SalesChannelsSection({ channels: { rows: [row], pagination }, copy, locale: "en-GB", href }));
  const table = tree.find(node => node.type === ReportTable)!.props;
  const link = table.renderCell(table.rows[0], { key: "name", type: "text" });
  expect(link.props.children).toBe(copy.unassigned);
  const url = new URL(link.props.href, "https://example.test");
  expect(url.searchParams.get("channelId")).toBe("__unassigned__");
  for (const key of ["page", "channelPage", "others"]) expect(url.searchParams.has(key)).toBe(false);
  expect(url.searchParams.get("currency")).toBe("EUR");
  expect(url.searchParams.get("snapshotId")).toBe("s");
  expect(url.searchParams.get("dateFrom")).toBe("2026-10-01");
  const revenue = table.renderCell(table.rows[0], { key: "revenue", type: "money" });
  expect(revenue.props.title).toBe(copy.partial);
  expect(nodes(revenue).some(node => node.type === PartialMarker)).toBe(true);
  expect(revenue.props.children[0]).toBe("—");
  const share = table.renderCell(table.rows[0], { key: "share", type: "percentage" });
  expect(share.props.children[0]).toBe("—");
  expect(nodes(share).some(node => node.type === PartialMarker)).toBe(false);
});
it("keeps channel pagination scoped separately and shows the empty-state message", () => {
  const copy = salesCopy.en;
  const tree = nodes(SalesChannelsSection({ channels: { rows: [], pagination }, copy, locale: "en-GB", href }));
  const footer = tree.find(node => node.type === ReportTableFooter);
  expect(footer).toBeDefined();
  const footerTree = nodes(ReportTableFooter({
    pagination,
    control: footer!.props.control,
    href: footer!.props.href,
    copy,
    rowCount: footer!.props.rowCount,
    emptyState: footer!.props.emptyState,
  }));
  expect(footerTree.some(node => node.type === "p" && node.props.children === copy.noRows)).toBe(true);
  const pager = footerTree.find(node => node.type === Pager)!.props;
  expect(pager.control).toBe("channelPage");
  expect(pager.pagination).toBe(pagination);
  const url = new URL(pager.href({ channelPage: "1" }), "https://example.test");
  expect(url.searchParams.get("channelPage")).toBe("1");
  expect(url.searchParams.get("page")).toBe("2");
  expect(url.searchParams.get("currency")).toBe("EUR");
});
