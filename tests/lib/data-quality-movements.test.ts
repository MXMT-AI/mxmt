import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DataQualityMovements } from "@/components/settings/data-quality-movements/data-quality-movements";
import { qualityAmountLabel } from "@/components/settings/data-quality-card/data-quality-labels";
const components = [
  { component: "MERCHANDISE", currency: "UAH", lineCount: 2, revenue: "0", missingAmountCount: 0 },
  { component: "RETURNS_CORRECTIONS", currency: "EUR", lineCount: 1, revenue: "-12.5", missingAmountCount: 1 },
  { component: "FUTURE_KIND", currency: null, lineCount: 1, revenue: null, missingAmountCount: 1 },
];
it.each(["uk", "en"] as const)("renders signed amounts, unavailable values and replay guidance in %s", lang => {
  const html = renderToStaticMarkup(createElement(DataQualityMovements, { components, replayRequired: 3, lang, orderExceptions: [{ code: "MISSING_BRAND", sourceSku: null, orderId: "order-1", lineId: "line-1" }] }));
  expect(html).toContain("0 UAH");
  expect(html).toContain(lang === "en" ? "-12.5 EUR" : "-12,5 EUR");
  expect(html).toContain(lang === "en" ? "Unavailable" : "Немає даних");
  expect(html).toContain("FUTURE_KIND");
  expect(html).toContain(lang === "en" ? "Returns and corrections" : "Повернення та коригування");
  expect(html).toContain(lang === "en" ? "Replay history" : "Повторіть історичний імпорт");
  expect(html).toContain(lang === "en" ? "Unknown SKU" : "SKU невідомий");
  expect(html).toContain("order-1");
});
it("omits empty exception disclosure and replay guidance when nothing requires attention", () => {
  const html = renderToStaticMarkup(createElement(DataQualityMovements, { components: [], replayRequired: 0, lang: "en", orderExceptions: undefined }));
  expect(html).toContain("Movement components");
  expect(html).not.toContain("<details");
  expect(html).not.toContain("Replay history");
});
it("retains a known zero while distinguishing unknown amount and unknown currency", () => {
  expect(qualityAmountLabel("0", "UAH", "en")).toBe("0 UAH");
  expect(qualityAmountLabel(null, "UAH", "en")).toBe("Unavailable");
  expect(qualityAmountLabel("12", null, "en")).toBe("12 currency unknown");
  expect(qualityAmountLabel("12", null, "uk")).toBe("12 валюта невідома");
});
