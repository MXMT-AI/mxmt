import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SalesCurrencySummary } from "@/components/data-reporting/sales-currency-summary/sales-currency-summary";
import { salesMetricRow, salesPlan } from "@/lib/sales-metrics";
import { resolveSalesPeriod } from "@/lib/sales-period";
import { defaultClientSettings } from "@/lib/merchandising-settings";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: string }) => createElement("a", { href }, children),
}));

const context = {
  period: resolveSalesPeriod({ now: new Date("2026-10-25T10:00Z") }),
  history: { current: false, ly: false },
  settings: defaultClientSettings(),
};

it.each([true, false])("keeps currency summaries separate and retains coverage and plan notices, uk=%s", (uk) => {
  const summary = (currency: string | null) => {
    const row = salesMetricRow("total", "Total", currency, [], context);
    return { ...row, plan: salesPlan(context, currency, row.current.revenue) };
  };
  const uah = summary("UAH");
  const usd = summary("USD");
  uah.current.coverage = "PARTIAL";
  uah.current.missingProfitCount = 3;
  uah.current.missingRevenueCount = 2;
  const html = renderToStaticMarkup(createElement(Fragment, null,
    createElement(SalesCurrencySummary, { row: uah, uk }),
    createElement(SalesCurrencySummary, { row: usd, uk }),
  ));
  expect(html).toContain('aria-label="UAH"');
  expect(html).toContain('aria-label="USD"');
  expect(html.match(/<dl/g)).toHaveLength(2);
  expect(html.match(/<dt/g)).toHaveLength(18);
  expect(html).toContain(uk ? "Часткові дані." : "Partial data.");
  expect(html).toContain(uk ? "Задати план і валюту" : "Set plan and currency");
});
