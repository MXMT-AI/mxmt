import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StockShareBar } from "@/components/stock/stock-share-bar/stock-share-bar";
import { StockStructure } from "@/components/stock/stock-structure/stock-structure";
import { createTableValueFormatter } from "@/lib/data-reporting-ui";
import { stockCopy } from "@/lib/stock-copy";

it("labels zero and missing shares without drawing segments for either", () => {
  const copy = stockCopy.en;
  const html = renderToStaticMarkup(createElement(StockStructure, {
    statuses: [
      { status: "HEALTHY", share: "0.25", skuCount: 1 },
      { status: "DEAD", share: "0", skuCount: 1 },
      { status: "RISK", share: null, skuCount: 1 },
    ],
    copy,
    formatValue: createTableValueFormatter("en-GB"),
  }));

  expect(html).toContain('role="img"');
  expect(html).toContain(`aria-label="${copy.statuses.HEALTHY} 25%, ${copy.statuses.DEAD} 0%, ${copy.statuses.RISK} —"`);
  expect(html).toContain("width:25%");
  expect(html.match(/style=/g)).toHaveLength(1);
});

it("hides the decorative bar from assistive technology when its legend is separate", () => {
  const html = renderToStaticMarkup(createElement(StockShareBar, {
    statuses: [{ status: "HEALTHY", share: "1" }],
  }));
  expect(html).toMatch(/^<span aria-hidden="true"/);
  expect(html).not.toContain('role="img"');
});
