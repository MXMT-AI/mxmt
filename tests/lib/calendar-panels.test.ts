import { createElement } from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CalendarStockPanel } from "@/components/calendar/calendar-panels/calendar-panels";
import type { StockItem } from "@/components/calendar/marketing-calendar/calendar-types";

const items: StockItem[] = [
  { brand: "Normal brand", stock: 0, woh: 0, status: "ok" },
  { brand: "Low brand", stock: 1, woh: null, status: "warn" },
  { brand: "Critical brand", stock: 2, woh: 3, status: "crit" },
  { brand: "Excess brand", stock: 10, woh: 100, status: "excess" },
];

it.each(["uk", "en"] as const)("localizes stock status and units while preserving unknown and zero coverage in %s", locale => {
  const html = renderToStaticMarkup(createElement(CalendarStockPanel, { items, title: "Stock", locale, expanded: false, onToggle: () => {} }));
  const labels = locale === "uk" ? ["Норма", "Мало", "Крит.", "Надлишок"] : ["Normal", "Low", "Critical", "Excess"];
  for (const label of labels) expect(html).toContain(`>${label}</span>`);
  expect(html).toContain(locale === "uk" ? "WOH 0д · 0 шт" : "WOH 0d · 0 pcs");
  expect(html).toContain(locale === "uk" ? "WOH —д · 1 шт" : "WOH —d · 1 pcs");
});

it.each([false, true])("preserves the ten-row limit and expansion state (%s)", expanded => {
  const many = Array.from({ length: 12 }, (_, index) => ({ ...items[0], brand: `Brand ${index}` }));
  const html = renderToStaticMarkup(createElement(CalendarStockPanel, { items: many, title: "Stock", locale: "en", expanded, onToggle: () => {} }));
  expect(html).toContain(`aria-expanded="${expanded}"`);
  expect(html).toContain(expanded ? "12/12" : "10/12");
  expect(html.includes("Brand 11")).toBe(expanded);
  expect(html).toContain(expanded ? "Show less ▲" : "Show 2 more ▼");
});
