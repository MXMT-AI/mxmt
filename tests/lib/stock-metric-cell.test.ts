import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StockMetricCell } from "@/components/stock/stock-metric-cell/stock-metric-cell";
import { createTableValueFormatter } from "@/lib/data-reporting-ui";

it("marks incomplete sell-through independently of whether its value is zero or missing", () => {
  const partialLabel = "Partial sell-through";
  const formatValue = createTableValueFormatter("en-GB");
  const ratio = { key: "sellThroughRatio", type: "percentage" } as const;
  const render = (row: Record<string, unknown>, column: Parameters<typeof StockMetricCell>[0]["column"] = ratio) =>
    renderToStaticMarkup(createElement(StockMetricCell, { row, column, formatValue, partialLabel }));

  expect(render({ sellThroughRatio: "0", strComplete: false })).toContain("0%");
  expect(render({ sellThroughRatio: null, strComplete: false })).toContain("—");
  expect(render({ sellThroughRatio: null, strComplete: false })).toContain(partialLabel);
  expect(render({ sellThroughRatio: "0", strComplete: false })).toContain(partialLabel);
  expect(render({ sellThroughRatio: "0", strComplete: true })).toBe("0%");
  expect(render({ quantity: "0", strComplete: false }, { key: "quantity", type: "quantity" })).toBe("0");
});
