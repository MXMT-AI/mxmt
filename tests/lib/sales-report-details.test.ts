import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SalesReportDetails } from "@/components/data-reporting/sales-report-details/sales-report-details";
import { defaultClientSettings } from "@/lib/merchandising-settings";
import { salesMetricRow } from "@/lib/sales-metrics";
import { resolveSalesPeriod } from "@/lib/sales-period";

it("keeps component revenue and paid preorders separate and omits rows without lines", () => {
  const context = {
    period: resolveSalesPeriod({ now: new Date("2026-10-25T10:00Z") }),
    history: { current: true, ly: false },
    settings: defaultClientSettings(),
  };
  const goods = salesMetricRow("MERCHANDISE", "Merchandise", "UAH", [], context);
  const giftCards = salesMetricRow("GIFT_CARD", "Gift card", "USD", [], context);
  const preorder = {
    currency: null,
    paidAmount: null,
    units: "1",
    orderCount: 1,
    lineCount: 1,
    missingAmountCount: 1,
    recognition: "NOT_RECOGNIZED_SALE" as const,
  };
  const html = renderToStaticMarkup(createElement(SalesReportDetails, {
    uk: false,
    data: {
      components: [{ ...goods, current: { ...goods.current, lineCount: 1, revenue: "0" } }, giftCards],
      preorders: [preorder, { ...preorder, currency: "USD", lineCount: 0 }],
      oneOffOrderCount: 0,
      oneOffOrders: [],
      issues: [],
    },
  }));

  expect(html).toContain("<p>Merchandise · UAH: 0</p><p>Paid preorders, separate from sales · —: —</p>");
  expect(html).not.toContain("Gift card · USD");
  expect(html).not.toContain("Paid preorders, separate from sales · USD");
});
