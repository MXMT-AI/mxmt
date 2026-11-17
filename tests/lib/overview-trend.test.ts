import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { OverviewTrend } from "@/components/overview/overview-trend/overview-trend";
import { defaultClientSettings } from "@/lib/merchandising-settings";
import { overviewCopy } from "@/lib/overview-copy";
import { salesMetricRow } from "@/lib/sales-metrics";
import { resolveSalesPeriod } from "@/lib/sales-period";

it("shares formatted values between the chart and accessible table while preserving negative, zero and missing revenue", () => {
  const history = { current: true, ly: true };
  const totals = salesMetricRow("total", "Total", "UAH", [], {
    period: resolveSalesPeriod({ now: new Date("2026-10-25T10:00Z") }),
    history,
    settings: defaultClientSettings(),
  }).current;
  const copy = overviewCopy.en;
  const money = vi.fn((value: string | null) => value === null ? "—" : `${value} UAH`);
  const html = renderToStaticMarkup(createElement(OverviewTrend, {
    rows: [
      { month: "2026-01", current: { ...totals, revenue: "-100" }, ly: { ...totals, revenue: "0" } },
      { month: "2026-02", current: { ...totals, revenue: null, missingRevenueCount: 1 }, ly: { ...totals, revenue: "50" } },
    ],
    history,
    locale: "en-GB",
    money,
    copy,
  }));

  expect(money).toHaveBeenCalledTimes(4);
  expect(html).toContain('<rect x="13" y="50" width="8" height="38"');
  expect(html).toContain('<rect x="3" y="50" width="8" height="0"');
  expect(html.match(/<rect /g)).toHaveLength(3);
  expect(html).toContain("<title>2026-01: -100 UAH</title>");
  expect(html).toContain("<td>-100 UAH</td><td>0 UAH</td>");
  expect(html).toContain("<td>—</td><td>50 UAH</td>");
  expect(html).toContain(copy.historyPartial);
});
